from .schemas import ProviderRequest, ProviderResponse
from .config import settings
from .llm_manager import LLMError, LLMManager, LLMRequest, ProviderType
from .security_utils import scrub_sensitive_info
import time
import logging

# Global LLM Manager instance
llm_manager = LLMManager()

# Initialize credentialed providers when configured and the credentialless
# DeepSeek community endpoint unconditionally.
async def initialize_providers():
    from .llm_manager import (
        AnthropicProvider,
        DeepSeekProvider,
        GoogleProvider,
        KimiProvider,
        OpenAIProvider,
    )

    if settings.OPENAI_API_KEY:
        await llm_manager.register_provider(ProviderType.OPENAI, OpenAIProvider())

    if settings.ANTHROPIC_API_KEY:
        await llm_manager.register_provider(ProviderType.ANTHROPIC, AnthropicProvider())

    if settings.GOOGLE_AI_API_KEY:
        await llm_manager.register_provider(ProviderType.GOOGLE, GoogleProvider())

    if settings.MOONSHOT_API_KEY:
        await llm_manager.register_provider(ProviderType.KIMI, KimiProvider())

    await llm_manager.register_provider(ProviderType.DEEPSEEK, DeepSeekProvider())


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
            temperature=req.temperature,
            reasoning_effort=req.reasoning_effort,
        )

        # Execute using the LLM manager
        response = await llm_manager.generate(llm_req)

        latency_ms = int((time.monotonic() - start_time) * 1000)

        # Convert back to the API response format
        return ProviderResponse(
            provider=response.provider.value,
            model=response.model,
            content=response.content,
            prompt_tokens=max(1, response.tokens_used // 2),  # Estimate prompt tokens
            completion_tokens=max(1, response.tokens_used // 2),  # Estimate completion tokens
            cost_usd=calculate_cost(response.provider, response.tokens_used),  # Calculate based on provider/model
            latency_ms=latency_ms
        )
    except ValueError as e:
        # Handle validation errors
        logging.error(f"Request validation error: {str(e)}")
        # Return an error response
        return ProviderResponse(
            provider=req.provider,
            model=req.model,
            content=f"Request validation error: {scrub_sensitive_info(str(e))}",
            prompt_tokens=0,
            completion_tokens=0,
            cost_usd=0.0,
            latency_ms=int((time.monotonic() - start_time) * 1000)
        )
    except LLMError:
        raise
    except Exception as e:
        # Handle unexpected errors
        logging.error(f"Error executing LLM request: {str(e)}", exc_info=True)
        # Return an error response with scrubbed sensitive info
        return ProviderResponse(
            provider=req.provider,
            model=req.model,
            content=f"Error processing request: {scrub_sensitive_info(str(e))}",
            prompt_tokens=0,
            completion_tokens=0,
            cost_usd=0.0,
            latency_ms=int((time.monotonic() - start_time) * 1000)
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
        ProviderType.KIMI: 0.009,  # Blended estimate; actual input/output rates differ
        ProviderType.DEEPSEEK: 0.0,  # Shared community endpoint currently advertises no charge
    }

    cost_per_token = cost_per_thousand_tokens.get(provider, 0.002) / 1000
    return cost_per_token * tokens_used
