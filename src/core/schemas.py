from pydantic import BaseModel, Field
from typing import List, Literal, Optional

# As defined in your documentation

class ProviderRequest(BaseModel):
    """
    Request model for a single LLM provider.
    """
    provider: Literal["openai", "anthropic", "cohere", "google"]
    model: str
    prompt: str = Field(..., max_length=10000)
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(1000, ge=1, le=4096)
    # ... other params as needed
    
class MultiProviderRequest(BaseModel):
    """
    Request model for orchestrating multiple providers.
    """
    requests: List[ProviderRequest]
    prompt: str # A single prompt to send to all models
    
class ProviderResponse(BaseModel):
    """
    Response model for a single LLM provider's output.
    """
    provider: str
    model: str
    content: str
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