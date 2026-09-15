from unittest.mock import MagicMock, patch

import pytest
from pydantic import SecretStr

from src.core.config import settings
from src.core.llm_manager import (
    KimiProvider,
    LLMRequest,
    ProviderType,
)


@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
async def test_kimi_provider_uses_fixed_parameter_contract(mock_post, monkeypatch):
    monkeypatch.setattr(
        settings,
        "MOONSHOT_API_KEY",
        SecretStr("test-only-kimi-key"),
    )
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Kimi response"}}],
        "usage": {"total_tokens": 12},
        "model": "kimi-k3",
    }
    mock_post.return_value = mock_response

    provider = KimiProvider()
    response = await provider.generate(
        LLMRequest(
            prompt="Test prompt",
            provider=ProviderType.KIMI,
            model="kimi-k3",
            max_tokens=2048,
            temperature=0.2,
        )
    )

    assert response.content == "Kimi response"
    assert response.provider == ProviderType.KIMI
    assert response.tokens_used == 12

    payload = mock_post.call_args.kwargs["json"]
    assert payload == {
        "model": "kimi-k3",
        "messages": [{"role": "user", "content": "Test prompt"}],
        "max_completion_tokens": 2048,
    }
    assert "temperature" not in payload
