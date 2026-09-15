"""Regression coverage for local matrix and upstream sidecar integration."""

from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from src.core.capability_loader import get_all_providers, get_supported_providers
from src.core.llm_manager import LLMResponse, ProviderType, RateLimitError
from src.core.providers import execute_llm_request, llm_manager
from src.core.schemas import ProviderRequest


def test_google_legacy_alias_normalizes_to_shared_provider_id():
    request = ProviderRequest(provider="google", model="gemini-1.5-pro", prompt="Hello")
    assert request.provider == "googleai"
    assert ProviderType(request.provider) == ProviderType.GOOGLE


def test_disabled_provider_stays_known_but_cannot_be_dispatched():
    assert "deepseek" in get_all_providers()
    assert "deepseek" not in get_supported_providers()
    with pytest.raises(ValidationError):
        ProviderRequest(provider="deepseek", model="old-model", prompt="Hello")


@pytest.mark.asyncio
async def test_kimi_reasoning_reaches_manager(monkeypatch):
    generate = AsyncMock(return_value=LLMResponse(
        content="Answer", provider=ProviderType.KIMI, model="kimi-k3",
        tokens_used=10, latency_ms=1,
    ))
    monkeypatch.setattr(llm_manager, "generate", generate)
    result = await execute_llm_request(ProviderRequest(
        provider="kimi", model="kimi-k3", prompt="Hello", reasoning_effort="max",
    ))
    assert result.success is True
    assert generate.call_args.args[0].reasoning_effort == "max"


@pytest.mark.asyncio
async def test_rate_limit_keeps_retry_after_for_http_boundary(monkeypatch):
    monkeypatch.setattr(llm_manager, "generate", AsyncMock(side_effect=RateLimitError("Limited", 7)))
    with pytest.raises(RateLimitError) as raised:
        await execute_llm_request(ProviderRequest(provider="openai", model="gpt-4o", prompt="Hello"))
    assert raised.value.retry_after_seconds == 7
