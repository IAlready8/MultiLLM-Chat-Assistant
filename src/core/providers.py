from .schemas import ProviderError, ProviderRequest, ProviderResponse
from .config import settings
from .llm_manager import LLMManager, LLMRequest, ProviderType
from .security_utils import scrub_sensitive_info
import time
import logging

# Global LLM Manager instance
llm_manager = LLMManager()

# Initialize providers if API keys are available
async def initialize_providers():
    from .llm_manager import OpenAIProvider, AnthropicProvider, GoogleProvider

    if settings.OPENAI_API_KEY:
        await llm_manager.register_provider(ProviderType.OPENAI, OpenAIProvider())

    if settings.ANTHROPIC_API_KEY:
        await llm_manager.register_provider(ProviderType.ANTHROPIC, AnthropicProvider())

    if settings.GOOGLE_AI_API_KEY:
        await llm_manager.register_provider(ProviderType.GOOGLE, GoogleProvider())


async def execute_llm_request(req: ProviderRequest) -> ProviderResponse:
    """
    Executes a single, normalized LLM request against the correct provider.
    """
    print(f"Executing request for: {req.provider} - {req.model}")
    start_time = time.monotonic()

    try:
        # Convert the request to the internal format
        # This will trigger validation in LLMRequest.__post_init__
        llm_req = LLMRequest(
            prompt=req.prompt,
            provider=ProviderType(req.provider),
            model=req.model,
            max_tokens=req.max_tokens,
            temperature=req.temperature
        )

        # Execute using the LLM manager
        response = await llm_manager.generate(llm_req)

        latency_ms = int((time.monotonic() - start_time) * 1000)
        if _looks_like_error_content(response.content):
            error = _classify_provider_error(Exception(response.content))
            return _provider_error_response(req, error, latency_ms)

        # Convert back to the API response format
        return ProviderResponse(
            provider=response.provider.value,
            model=response.model,
            success=True,
            content=response.content,
            prompt_tokens=max(1, response.tokens_used // 2),  # Estimate prompt tokens
            completion_tokens=max(1, response.tokens_used // 2),  # Estimate completion tokens
            cost_usd=calculate_cost(response.provider, response.tokens_used),  # Calculate based on provider/model
            latency_ms=latency_ms
        )
    except ValueError as e:
        # Handle validation errors
        logging.error(f"Request validation error: {str(e)}")
        return _provider_error_response(
            req,
            {
                "code": "PROVIDER_UNSUPPORTED",
                "message": "Unsupported or invalid provider request",
                "retryable": False,
            },
            int((time.monotonic() - start_time) * 1000),
        )
    except Exception as e:
        # Handle unexpected errors
        logging.error(f"Error executing LLM request: {str(e)}", exc_info=True)
        return _provider_error_response(
            req,
            _classify_provider_error(e),
            int((time.monotonic() - start_time) * 1000),
        )


def calculate_cost(provider: ProviderType, tokens_used: int) -> float:
    """
    Calculate estimated cost based on provider and tokens used.
    This is a simplified calculation - in production, use actual pricing.
    """
    # Simplified cost calculation - in production, use actual pricing from each provider
    cost_per_thousand_tokens = {
        ProviderType.OPENAI: 0.002,  # Example: $0.002 per 1k tokens for gpt-3.5-turbo
        ProviderType.ANTHROPIC: 0.008,  # Example: $0.008 per 1k tokens for Claude
        ProviderType.GOOGLE: 0.0005,  # Example: $0.0005 per 1k tokens for Gemini
    }

    cost_per_token = cost_per_thousand_tokens.get(provider, 0.002) / 1000
    return cost_per_token * tokens_used


def _looks_like_error_content(content: str) -> bool:
    lowered = content.strip().lower()
    return (
        lowered.startswith("error")
        or lowered.startswith("request validation error")
        or lowered.startswith("no provider registered")
    )


def _classify_provider_error(error: Exception) -> dict:
    message = scrub_sensitive_info(str(error))
    lower = message.lower()

    if "invalid api key" in lower or "http 401" in lower or "http 403" in lower:
        return {
            "code": "PROVIDER_AUTH_ERROR",
            "message": "Provider rejected the configured API key",
            "retryable": False,
        }

    if "rate limit" in lower or "http 429" in lower:
        return {
            "code": "RATE_LIMITED",
            "message": "Provider rate limit reached, please retry shortly",
            "retryable": True,
        }

    if "timeout" in lower or "timed out" in lower or "abort" in lower:
        return {
            "code": "PROVIDER_TIMEOUT",
            "message": "Provider request timed out",
            "retryable": True,
        }

    if "invalid json" in lower or "malformed" in lower or "unexpected response format" in lower:
        return {
            "code": "PROVIDER_MALFORMED_RESPONSE",
            "message": "Provider returned malformed response",
            "retryable": True,
        }

    if "connection" in lower or "network" in lower or "fetch failed" in lower:
        return {
            "code": "NETWORK_ERROR",
            "message": "Failed to reach upstream provider",
            "retryable": True,
        }

    if "no provider registered" in lower or "unsupported" in lower:
        return {
            "code": "PROVIDER_UNSUPPORTED",
            "message": "Provider is not supported by the Python sidecar",
            "retryable": False,
        }

    return {
        "code": "UNKNOWN_PROVIDER_ERROR",
        "message": message or "Provider request failed",
        "retryable": False,
    }


def _provider_error_response(
    req: ProviderRequest,
    error: dict,
    latency_ms: int,
) -> ProviderResponse:
    return ProviderResponse(
        provider=req.provider,
        model=req.model,
        success=False,
        content="",
        error=ProviderError(
            code=error["code"],
            message=error["message"],
            retryable=error["retryable"],
        ),
        prompt_tokens=0,
        completion_tokens=0,
        cost_usd=0.0,
        latency_ms=latency_ms,
    )
