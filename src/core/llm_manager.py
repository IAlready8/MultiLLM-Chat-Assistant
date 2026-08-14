"""
LLM Manager Module
Implements an async LLM manager with provider abstraction, caching, and performance metrics.
"""

import asyncio
import time
import hashlib
import logging
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from enum import Enum
from typing import Dict, List, Optional, Any, Union, Literal
from cachetools import LRUCache
import httpx
from .config import settings
from .security_utils import validate_prompt, validate_model_name, validate_temperature, validate_max_tokens, validate_provider_type, sanitize_input


class ProviderType(str, Enum):
    """Enum for supported LLM providers"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    COHERE = "cohere"
    KIMI = "kimi"
    DEEPSEEK = "deepseek"


@dataclass
class LLMRequest:
    """Request object for LLM generation"""
    prompt: str
    provider: ProviderType
    model: str = ""
    max_tokens: int = 1000
    temperature: float = 0.7
    reasoning_effort: Literal["off", "low", "high", "max"] = "high"
    # Additional parameters can be added here

    def __post_init__(self):
        """Validate the request parameters after initialization"""
        # Sanitize and validate prompt
        if not isinstance(self.prompt, str):
            raise ValueError("Prompt must be a string")

        # Sanitize the prompt
        self.prompt = sanitize_input(self.prompt)

        if not validate_prompt(self.prompt):
            raise ValueError(f"Invalid prompt: exceeds length limit or contains dangerous patterns")

        # Validate model name
        if self.model and not validate_model_name(self.model):
            raise ValueError(f"Invalid model name: {self.model}")

        # Validate temperature
        if not validate_temperature(self.temperature):
            raise ValueError(f"Invalid temperature: {self.temperature}. Must be between 0.0 and 2.0")

        # Validate max_tokens
        if not validate_max_tokens(self.max_tokens):
            raise ValueError(f"Invalid max_tokens: {self.max_tokens}. Must be between 1 and 4096")

        if self.reasoning_effort not in {"off", "low", "high", "max"}:
            raise ValueError(
                "Invalid reasoning_effort: must be one of off, low, high, max"
            )


@dataclass
class LLMResponse:
    """Response object from LLM generation"""
    content: str
    provider: ProviderType
    model: str
    tokens_used: int
    latency_ms: float
    metadata: Optional[Dict[str, Any]] = None


class LLMError(Exception):
    """Base exception for LLM-related errors"""
    pass


class ProviderNotRegisteredError(LLMError):
    """Raised when a provider is not registered"""
    pass


class APIConnectionError(LLMError):
    """Raised when there's an issue connecting to an API"""
    pass


class InvalidAPIKeyError(LLMError):
    """Raised when an API key is invalid"""
    pass


class RateLimitError(LLMError):
    """Raised when rate limit is exceeded"""

    def __init__(self, message: str, retry_after_seconds: Optional[int] = None):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


def parse_retry_after_seconds(
    value: Optional[str],
    now: Optional[datetime] = None,
) -> int:
    """Parse RFC Retry-After delay-seconds or HTTP-date with a safe fallback."""

    if not value:
        return 5

    normalized = value.strip()
    if normalized.isdigit():
        return max(1, int(normalized))

    try:
        retry_at = parsedate_to_datetime(normalized)
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        current_time = now or datetime.now(timezone.utc)
        return max(1, math.ceil((retry_at - current_time).total_seconds()))
    except (TypeError, ValueError, OverflowError):
        return 5


class LLMProvider(ABC):
    """Abstract base class for LLM providers"""

    @abstractmethod
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate response from the LLM provider"""
        pass

    @abstractmethod
    def health_check(self) -> bool:
        """Check if the provider is healthy"""
        pass


class OpenAIProvider(LLMProvider):
    """OpenAI API provider implementation"""

    def __init__(self):
        if not settings.OPENAI_API_KEY:
            raise InvalidAPIKeyError("OpenAI API key not configured")

        self.base_url = "https://api.openai.com/v1"
        self.headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY.get_secret_value()}"}
        self.timeout = 60.0

    async def generate(self, request: LLMRequest) -> LLMResponse:
        start_time = time.time()

        try:
            async with httpx.AsyncClient(base_url=self.base_url, headers=self.headers, timeout=self.timeout) as client:
                response = await client.post(
                    "/chat/completions",
                    json={
                        "model": request.model or "gpt-3.5-turbo",
                        "messages": [{"role": "user", "content": request.prompt}],
                        "max_tokens": request.max_tokens,
                        "temperature": request.temperature,
                    }
                )

            # Handle specific HTTP errors
            if response.status_code == 429:
                raise RateLimitError(f"OpenAI rate limit exceeded: {response.text}")
            elif response.status_code == 401:
                raise InvalidAPIKeyError(f"Invalid OpenAI API key: {response.text}")
            elif response.status_code >= 500:
                raise APIConnectionError(f"OpenAI server error: {response.text}")
            elif not response.is_success:
                response.raise_for_status()

            # Safely parse JSON response
            try:
                data = response.json()
            except ValueError as e:  # json.JSONDecodeError in Python 3.5+
                logging.error(f"Failed to decode JSON response from OpenAI: {e}")
                return LLMResponse(
                    content=f"Error: Invalid JSON response from OpenAI API",
                    provider=ProviderType.OPENAI,
                    model=request.model,
                    tokens_used=0,
                    latency_ms=(time.time() - start_time) * 1000
                )

            # Safely extract content and tokens
            try:
                content = data["choices"][0]["message"]["content"]
            except (KeyError, IndexError):
                logging.error(f"Unexpected response format from OpenAI: {data}")
                return LLMResponse(
                    content=f"Error: Unexpected response format from OpenAI API",
                    provider=ProviderType.OPENAI,
                    model=request.model,
                    tokens_used=0,
                    latency_ms=(time.time() - start_time) * 1000
                )

            try:
                tokens_used = data["usage"]["total_tokens"]
            except (KeyError, TypeError):
                logging.warning(f"Token usage not available in OpenAI response: {data}")
                tokens_used = len(request.prompt.split()) + len(content.split())  # Estimate

            latency_ms = (time.time() - start_time) * 1000

            return LLMResponse(
                content=content,
                provider=ProviderType.OPENAI,
                model=data.get("model", request.model),  # Use request.model as fallback
                tokens_used=tokens_used,
                latency_ms=latency_ms
            )
        except httpx.TimeoutException:
            latency_ms = (time.time() - start_time) * 1000
            return LLMResponse(
                content="Error: OpenAI API request timed out",
                provider=ProviderType.OPENAI,
                model=request.model,
                tokens_used=0,
                latency_ms=latency_ms
            )
        except httpx.RequestError as e:
            latency_ms = (time.time() - start_time) * 1000
            return LLMResponse(
                content=f"Error connecting to OpenAI API: {str(e)}",
                provider=ProviderType.OPENAI,
                model=request.model,
                tokens_used=0,
                latency_ms=latency_ms
            )
        except RateLimitError:
            raise  # Re-raise specific exceptions
        except InvalidAPIKeyError:
            raise  # Re-raise specific exceptions
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            logging.exception(f"Unexpected error in OpenAI provider: {str(e)}")
            return LLMResponse(
                content=f"Error calling OpenAI API: {str(e)}",
                provider=ProviderType.OPENAI,
                model=request.model,
                tokens_used=0,
                latency_ms=latency_ms
            )

    def health_check(self) -> bool:
        return settings.OPENAI_API_KEY is not None


class AnthropicProvider(LLMProvider):
    """Anthropic API provider implementation"""

    def __init__(self):
        if not settings.ANTHROPIC_API_KEY:
            raise InvalidAPIKeyError("Anthropic API key not configured")

        self.base_url = "https://api.anthropic.com/v1"
        self.headers = {
            "x-api-key": f"{settings.ANTHROPIC_API_KEY.get_secret_value()}",
            "anthropic-version": "2023-06-01"
        }
        self.timeout = 60.0

    async def generate(self, request: LLMRequest) -> LLMResponse:
        start_time = time.time()

        try:
            async with httpx.AsyncClient(base_url=self.base_url, headers=self.headers, timeout=self.timeout) as client:
                response = await client.post(
                    "/messages",
                    json={
                        "model": request.model or "claude-3-haiku-20240307",
                        "max_tokens": request.max_tokens,
                        "temperature": request.temperature,
                        "messages": [{"role": "user", "content": request.prompt}]
                    }
                )

            # Handle specific HTTP errors
            if response.status_code == 429:
                raise RateLimitError(f"Anthropic rate limit exceeded: {response.text}")
            elif response.status_code == 401:
                raise InvalidAPIKeyError(f"Invalid Anthropic API key: {response.text}")
            elif response.status_code >= 500:
                raise APIConnectionError(f"Anthropic server error: {response.text}")
            elif not response.is_success:
                response.raise_for_status()

            # Safely parse JSON response
            try:
                data = response.json()
            except ValueError as e:  # json.JSONDecodeError in Python 3.5+
                logging.error(f"Failed to decode JSON response from Anthropic: {e}")
                return LLMResponse(
                    content=f"Error: Invalid JSON response from Anthropic API",
                    provider=ProviderType.ANTHROPIC,
                    model=request.model,
                    tokens_used=0,
                    latency_ms=(time.time() - start_time) * 1000
                )

            # Safely extract content and tokens
            try:
                content = data["content"][0]["text"]
            except (KeyError, IndexError):
                logging.error(f"Unexpected response format from Anthropic: {data}")
                return LLMResponse(
                    content=f"Error: Unexpected response format from Anthropic API",
                    provider=ProviderType.ANTHROPIC,
                    model=request.model,
                    tokens_used=0,
                    latency_ms=(time.time() - start_time) * 1000
                )

            try:
                tokens_used = data["usage"]["input_tokens"] + data["usage"]["output_tokens"]
            except (KeyError, TypeError):
                logging.warning(f"Token usage not available in Anthropic response: {data}")
                tokens_used = len(request.prompt.split()) + len(content.split())  # Estimate

            latency_ms = (time.time() - start_time) * 1000

            return LLMResponse(
                content=content,
                provider=ProviderType.ANTHROPIC,
                model=data.get("model", request.model),  # Use request.model as fallback
                tokens_used=tokens_used,
                latency_ms=latency_ms
            )
        except httpx.TimeoutException:
            latency_ms = (time.time() - start_time) * 1000
            return LLMResponse(
                content="Error: Anthropic API request timed out",
                provider=ProviderType.ANTHROPIC,
                model=request.model,
                tokens_used=0,
                latency_ms=latency_ms
            )
        except httpx.RequestError as e:
            latency_ms = (time.time() - start_time) * 1000
            return LLMResponse(
                content=f"Error connecting to Anthropic API: {str(e)}",
                provider=ProviderType.ANTHROPIC,
                model=request.model,
                tokens_used=0,
                latency_ms=latency_ms
            )
        except RateLimitError:
            raise  # Re-raise specific exceptions
        except InvalidAPIKeyError:
            raise  # Re-raise specific exceptions
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            logging.exception(f"Unexpected error in Anthropic provider: {str(e)}")
            return LLMResponse(
                content=f"Error calling Anthropic API: {str(e)}",
                provider=ProviderType.ANTHROPIC,
                model=request.model,
                tokens_used=0,
                latency_ms=latency_ms
            )

    def health_check(self) -> bool:
        return settings.ANTHROPIC_API_KEY is not None


class GoogleProvider(LLMProvider):
    """Google API provider implementation"""

    def __init__(self):
        if not settings.GOOGLE_AI_API_KEY:
            raise InvalidAPIKeyError("Google API key not configured")

        self.api_key = settings.GOOGLE_AI_API_KEY.get_secret_value()
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self.timeout = 60.0

    async def generate(self, request: LLMRequest) -> LLMResponse:
        start_time = time.time()

        try:
            model_name = request.model or "gemini-pro"
            url = f"{self.base_url}/models/{model_name}:generateContent?key={self.api_key}"

            payload = {
                "contents": [{
                    "parts": [{
                        "text": request.prompt
                    }]
                }],
                "generationConfig": {
                    "maxOutputTokens": request.max_tokens,
                    "temperature": request.temperature
                }
            }

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)

                # Handle specific HTTP errors
                if response.status_code == 429:
                    raise RateLimitError(f"Google rate limit exceeded: {response.text}")
                elif response.status_code == 400:
                    raise InvalidAPIKeyError(f"Invalid Google API request: {response.text}")
                elif response.status_code == 403:
                    raise InvalidAPIKeyError(f"Google API access denied: {response.text}")
                elif response.status_code >= 500:
                    raise APIConnectionError(f"Google server error: {response.text}")
                elif not response.is_success:
                    response.raise_for_status()

                # Safely parse JSON response
                try:
                    data = response.json()
                except ValueError as e:  # json.JSONDecodeError in Python 3.5+
                    logging.error(f"Failed to decode JSON response from Google: {e}")
                    return LLMResponse(
                        content=f"Error: Invalid JSON response from Google API",
                        provider=ProviderType.GOOGLE,
                        model=model_name,
                        tokens_used=0,
                        latency_ms=(time.time() - start_time) * 1000
                    )

                # Safely extract content and tokens
                try:
                    content = data["candidates"][0]["content"]["parts"][0]["text"]
                except (KeyError, IndexError):
                    logging.error(f"Unexpected response format from Google: {data}")
                    return LLMResponse(
                        content=f"Error: Unexpected response format from Google API",
                        provider=ProviderType.GOOGLE,
                        model=model_name,
                        tokens_used=0,
                        latency_ms=(time.time() - start_time) * 1000
                    )

                try:
                    # Try to get actual token usage from response if available
                    tokens_used = data["usageMetadata"]["totalTokens"]
                except (KeyError, TypeError):
                    logging.warning(f"Token usage not available in Google response: {data}")
                    tokens_used = len(request.prompt.split()) + len(content.split())  # Estimate

                latency_ms = (time.time() - start_time) * 1000

                return LLMResponse(
                    content=content,
                    provider=ProviderType.GOOGLE,
                    model=model_name,
                    tokens_used=tokens_used,
                    latency_ms=latency_ms
                )
        except httpx.TimeoutException:
            latency_ms = (time.time() - start_time) * 1000
            return LLMResponse(
                content="Error: Google API request timed out",
                provider=ProviderType.GOOGLE,
                model=request.model,
                tokens_used=0,
                latency_ms=latency_ms
            )
        except httpx.RequestError as e:
            latency_ms = (time.time() - start_time) * 1000
            return LLMResponse(
                content=f"Error connecting to Google API: {str(e)}",
                provider=ProviderType.GOOGLE,
                model=request.model,
                tokens_used=0,
                latency_ms=latency_ms
            )
        except RateLimitError:
            raise  # Re-raise specific exceptions
        except InvalidAPIKeyError:
            raise  # Re-raise specific exceptions
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            logging.exception(f"Unexpected error in Google provider: {str(e)}")
            return LLMResponse(
                content=f"Error calling Google API: {str(e)}",
                provider=ProviderType.GOOGLE,
                model=request.model,
                tokens_used=0,
                latency_ms=latency_ms
            )

    def health_check(self) -> bool:
        return settings.GOOGLE_AI_API_KEY is not None


class KimiProvider(LLMProvider):
    """Kimi API provider implementation using Moonshot AI's compatible API."""

    def __init__(self):
        if not settings.MOONSHOT_API_KEY:
            raise InvalidAPIKeyError("Kimi API key not configured")

        self.base_url = "https://api.moonshot.ai/v1"
        self.headers = {
            "Authorization": f"Bearer {settings.MOONSHOT_API_KEY.get_secret_value()}",
            "Content-Type": "application/json",
        }
        self.timeout = 120.0

    async def generate(self, request: LLMRequest) -> LLMResponse:
        start_time = time.time()

        try:
            payload = {
                "model": request.model or "kimi-k3",
                "messages": [{"role": "user", "content": request.prompt}],
                "max_completion_tokens": request.max_tokens,
            }

            async with httpx.AsyncClient(
                base_url=self.base_url,
                headers=self.headers,
                timeout=self.timeout,
            ) as client:
                response = await client.post("/chat/completions", json=payload)

            if response.status_code == 429:
                raise RateLimitError(f"Kimi rate limit exceeded: {response.text}")
            if response.status_code in (401, 403):
                raise InvalidAPIKeyError(f"Invalid Kimi API key: {response.text}")
            if response.status_code >= 500:
                raise APIConnectionError(f"Kimi server error: {response.text}")
            if not response.is_success:
                response.raise_for_status()

            try:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                logging.error(f"Unexpected response format from Kimi: {exc}")
                return LLMResponse(
                    content="Error: Unexpected response format from Kimi API",
                    provider=ProviderType.KIMI,
                    model=request.model,
                    tokens_used=0,
                    latency_ms=(time.time() - start_time) * 1000,
                )

            usage = data.get("usage") or {}
            tokens_used = usage.get("total_tokens")
            if not isinstance(tokens_used, int):
                tokens_used = len(request.prompt.split()) + len(content.split())

            return LLMResponse(
                content=content,
                provider=ProviderType.KIMI,
                model=data.get("model", request.model or "kimi-k3"),
                tokens_used=tokens_used,
                latency_ms=(time.time() - start_time) * 1000,
            )
        except httpx.TimeoutException:
            return LLMResponse(
                content="Error: Kimi API request timed out",
                provider=ProviderType.KIMI,
                model=request.model,
                tokens_used=0,
                latency_ms=(time.time() - start_time) * 1000,
            )
        except httpx.RequestError as exc:
            return LLMResponse(
                content=f"Error connecting to Kimi API: {str(exc)}",
                provider=ProviderType.KIMI,
                model=request.model,
                tokens_used=0,
                latency_ms=(time.time() - start_time) * 1000,
            )
        except (RateLimitError, InvalidAPIKeyError):
            raise
        except Exception as exc:
            logging.exception(f"Unexpected error in Kimi provider: {str(exc)}")
            return LLMResponse(
                content=f"Error calling Kimi API: {str(exc)}",
                provider=ProviderType.KIMI,
                model=request.model,
                tokens_used=0,
                latency_ms=(time.time() - start_time) * 1000,
            )

    def health_check(self) -> bool:
        return settings.MOONSHOT_API_KEY is not None


class DeepSeekProvider(LLMProvider):
    """Historical DeepSeek community adapter retained for future restoration."""

    def __init__(self):
        self.base_url = (
            "https://q5dh1rfszfym23hj.us-east-2.aws.endpoints."
            "huggingface.cloud/v1"
        )
        self.headers = {"Content-Type": "application/json"}
        self.timeout = 120.0

    async def generate(self, request: LLMRequest) -> LLMResponse:
        start_time = time.time()

        try:
            payload = {
                "model": request.model or "deepseek-ai/DeepSeek-V4-Flash-0731",
                "messages": [{"role": "user", "content": request.prompt}],
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
                "top_p": 0.95,
            }
            if request.reasoning_effort != "off":
                payload["reasoning_effort"] = request.reasoning_effort

            async with httpx.AsyncClient(
                base_url=self.base_url,
                headers=self.headers,
                timeout=self.timeout,
            ) as client:
                response = await client.post("/chat/completions", json=payload)

            if response.status_code == 429:
                retry_after = parse_retry_after_seconds(
                    response.headers.get("retry-after")
                )
                raise RateLimitError(
                    f"DeepSeek community endpoint rate limited; retry after "
                    f"{retry_after} seconds",
                    retry_after_seconds=retry_after,
                )
            if response.status_code in (401, 403):
                raise APIConnectionError(
                    f"DeepSeek community endpoint rejected the request: {response.text}"
                )
            if response.status_code >= 500:
                raise APIConnectionError(f"DeepSeek server error: {response.text}")
            if not response.is_success:
                response.raise_for_status()

            try:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                if not isinstance(content, str):
                    raise TypeError("DeepSeek response content is not text")
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                logging.error(f"Unexpected response format from DeepSeek: {exc}")
                return LLMResponse(
                    content="Error: Unexpected response format from DeepSeek API",
                    provider=ProviderType.DEEPSEEK,
                    model=request.model,
                    tokens_used=0,
                    latency_ms=(time.time() - start_time) * 1000,
                )

            usage = data.get("usage") or {}
            tokens_used = usage.get("total_tokens")
            if not isinstance(tokens_used, int):
                tokens_used = len(request.prompt.split()) + len(content.split())

            return LLMResponse(
                content=content,
                provider=ProviderType.DEEPSEEK,
                model=data.get(
                    "model",
                    request.model or "deepseek-ai/DeepSeek-V4-Flash-0731",
                ),
                tokens_used=tokens_used,
                latency_ms=(time.time() - start_time) * 1000,
            )
        except httpx.TimeoutException:
            return LLMResponse(
                content="Error: DeepSeek API request timed out",
                provider=ProviderType.DEEPSEEK,
                model=request.model,
                tokens_used=0,
                latency_ms=(time.time() - start_time) * 1000,
            )
        except httpx.RequestError as exc:
            return LLMResponse(
                content=f"Error connecting to DeepSeek API: {str(exc)}",
                provider=ProviderType.DEEPSEEK,
                model=request.model,
                tokens_used=0,
                latency_ms=(time.time() - start_time) * 1000,
            )
        except RateLimitError:
            raise
        except Exception as exc:
            logging.exception(f"Unexpected error in DeepSeek provider: {str(exc)}")
            return LLMResponse(
                content=f"Error calling DeepSeek API: {str(exc)}",
                provider=ProviderType.DEEPSEEK,
                model=request.model,
                tokens_used=0,
                latency_ms=(time.time() - start_time) * 1000,
            )

    def health_check(self) -> bool:
        return True


class LLMManager:
    """Main LLM manager class with caching and performance metrics"""

    def __init__(self, cache_size: int = 1000):
        self._providers: Dict[ProviderType, LLMProvider] = {}
        self._request_cache = LRUCache(maxsize=cache_size)
        self._stats = {
            "requests_total": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "errors": 0
        }

    async def register_provider(self, provider_type: ProviderType, provider: LLMProvider):
        """Register a provider with the manager"""
        try:
            self._providers[provider_type] = provider
        except Exception as e:
            logging.error(f"Failed to register provider {provider_type}: {str(e)}")
            raise

    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate response using the appropriate provider with caching"""
        self._stats["requests_total"] += 1

        # Validate request
        if not request.prompt.strip():
            self._stats["errors"] += 1
            return LLMResponse(
                content="Error: Empty prompt provided",
                provider=request.provider,
                model=request.model,
                tokens_used=0,
                latency_ms=0
            )

        # Create cache key from request parameters
        try:
            cache_key = hashlib.md5(
                f"{request.prompt}:{request.provider}:{request.model}:"
                f"{request.max_tokens}:{request.temperature}:"
                f"{request.reasoning_effort}".encode()
            ).hexdigest()
        except Exception as e:
            logging.warning(f"Failed to create cache key: {str(e)}")
            cache_key = None

        # Check cache first if cache_key is valid
        if cache_key and cache_key in self._request_cache:
            self._stats["cache_hits"] += 1
            cached_response = self._request_cache[cache_key]
            # Add cache hit indicator to metadata
            if cached_response.metadata:
                cached_response.metadata["cached"] = True
            else:
                cached_response.metadata = {"cached": True}
            return cached_response
        else:
            if cache_key:
                self._stats["cache_misses"] += 1

        # Get the appropriate provider
        provider = self._providers.get(request.provider)
        if not provider:
            self._stats["errors"] += 1
            return LLMResponse(
                content=f"No provider registered for {request.provider}",
                provider=request.provider,
                model=request.model,
                tokens_used=0,
                latency_ms=0
            )

        # Generate response
        try:
            response = await provider.generate(request)

            # Cache the response if cache_key is valid
            if cache_key:
                self._request_cache[cache_key] = response

            return response
        except Exception as e:
            self._stats["errors"] += 1
            logging.exception(f"Error generating response: {str(e)}")
            return LLMResponse(
                content=f"Error generating response: {str(e)}",
                provider=request.provider,
                model=request.model,
                tokens_used=0,
                latency_ms=0
            )

    async def generate_multiple(self, requests: List[LLMRequest]) -> List[LLMResponse]:
        """Generate responses for multiple requests concurrently"""
        # Limit concurrent requests to prevent overwhelming providers
        semaphore = asyncio.Semaphore(10)  # Max 10 concurrent requests

        async def limited_generate(request):
            async with semaphore:
                return await self.generate(request)

        tasks = [limited_generate(req) for req in requests]
        return await asyncio.gather(*tasks, return_exceptions=True)

    def get_stats(self) -> Dict[str, Any]:
        """Get performance statistics"""
        total_requests = self._stats["requests_total"]
        cache_hits = self._stats["cache_hits"]

        cache_hit_rate = (
            f"{(cache_hits / total_requests * 100):.2f}%" if total_requests > 0 else "0.00%"
        )

        return {
            **self._stats.copy(),
            "cache_hit_rate": cache_hit_rate
        }

    def health_check(self) -> Dict[ProviderType, bool]:
        """Check health of all registered providers"""
        health_status = {}
        for provider_type, provider in self._providers.items():
            try:
                health_status[provider_type] = provider.health_check()
            except Exception as e:
                logging.error(f"Health check failed for {provider_type}: {str(e)}")
                health_status[provider_type] = False
        return health_status
