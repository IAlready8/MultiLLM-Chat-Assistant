from pydantic import BaseModel, Field, field_validator
from typing import List, Literal, Optional

from .capability_loader import is_supported

# As defined in your documentation


def _validate_provider(value: str) -> str:
    provider = value.lower()
    if provider == "google":
        provider = "googleai"
    if not is_supported(provider):
        raise ValueError("Unsupported provider")
    return provider

class ProviderRequest(BaseModel):
    """
    Request model for a single LLM provider.
    """
    provider: str
    model: str
    prompt: str = Field(..., max_length=10000)
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(1000, ge=1, le=4096)
    reasoning_effort: Literal["off", "low", "high", "max"] = "high"
    # ... other params as needed

    @field_validator("provider")
    @classmethod
    def provider_is_known(cls, value: str) -> str:
        return _validate_provider(value)


class StreamMessage(BaseModel):
    """Message model for stream-oriented chat requests."""

    role: Literal["system", "user", "assistant"]
    content: str = Field(..., max_length=10000)


class ProviderStreamRequest(BaseModel):
    """Request model for streaming chat completions."""

    provider: str
    messages: List[StreamMessage] = Field(..., min_length=1)
    model: str
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(1000, ge=1, le=4096)
    reasoning_effort: Literal["off", "low", "high", "max"] = "high"

    @field_validator("provider")
    @classmethod
    def provider_is_known(cls, value: str) -> str:
        return _validate_provider(value)

class MultiProviderRequest(BaseModel):
    """
    Request model for orchestrating multiple providers.
    """
    requests: List[ProviderRequest]
    prompt: str # A single prompt to send to all models
    
class ProviderError(BaseModel):
    """
    Structured provider-level error returned inside orchestration results.
    """
    code: str
    message: str
    retryable: bool = False


class ProviderResponse(BaseModel):
    """
    Response model for a single LLM provider's output.
    """
    provider: str
    model: str
    success: bool = True
    content: str = ""
    error: Optional[ProviderError] = None
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    latency_ms: int
    
class HealthResponse(BaseModel):
    """
    Response model for the health check endpoint.
    """
    status: Literal["ok", "error"]
    services: dict[str, Literal["ok", "error"]]
    error: Optional[str] = None
