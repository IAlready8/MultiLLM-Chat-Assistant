from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from src.core.llm_manager import (
    DeepSeekProvider,
    LLMRequest,
    ProviderType,
    RateLimitError,
    parse_retry_after_seconds,
)
from src.core.security_utils import validate_model_name


def test_hugging_face_model_id_is_allowed_without_allowing_paths():
    assert validate_model_name("deepseek-ai/DeepSeek-V4-Flash-0731")
    assert not validate_model_name("../DeepSeek-V4-Flash-0731")
    assert not validate_model_name("deepseek-ai/models/DeepSeek-V4-Flash-0731")


@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
async def test_deepseek_provider_uses_community_endpoint_contract(mock_post):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "DeepSeek response"}}],
        "usage": {"total_tokens": 12},
        "model": "deepseek-ai/DeepSeek-V4-Flash-0731",
    }
    mock_post.return_value = mock_response

    provider = DeepSeekProvider()
    response = await provider.generate(
        LLMRequest(
            prompt="Test prompt",
            provider=ProviderType.DEEPSEEK,
            model="deepseek-ai/DeepSeek-V4-Flash-0731",
            max_tokens=2048,
            temperature=0.2,
        )
    )

    assert response.content == "DeepSeek response"
    assert response.provider == ProviderType.DEEPSEEK
    assert response.tokens_used == 12

    payload = mock_post.call_args.kwargs["json"]
    assert payload == {
        "model": "deepseek-ai/DeepSeek-V4-Flash-0731",
        "messages": [{"role": "user", "content": "Test prompt"}],
        "max_tokens": 2048,
        "reasoning_effort": "high",
        "temperature": 0.2,
        "top_p": 0.95,
    }
    assert provider.headers == {"Content-Type": "application/json"}


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("17", 17),
        ("Sun, 02 Aug 2026 12:00:19 GMT", 19),
        ("17 seconds", 5),
        (None, 5),
    ],
)
def test_parse_retry_after_supports_http_contract(value, expected):
    assert parse_retry_after_seconds(
        value,
        now=datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc),
    ) == expected


@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
async def test_deepseek_provider_preserves_retry_after(mock_post):
    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 429
    mock_response.headers = {"retry-after": "17"}
    mock_post.return_value = mock_response

    provider = DeepSeekProvider()
    with pytest.raises(RateLimitError) as error:
        await provider.generate(
            LLMRequest(
                prompt="Test prompt",
                provider=ProviderType.DEEPSEEK,
                model="deepseek-ai/DeepSeek-V4-Flash-0731",
            )
        )

    assert error.value.retry_after_seconds == 17


@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
async def test_deepseek_provider_can_disable_reasoning(mock_post):
    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Fast response"}}],
        "usage": {"total_tokens": 5},
    }
    mock_post.return_value = mock_response

    provider = DeepSeekProvider()
    await provider.generate(
        LLMRequest(
            prompt="Test prompt",
            provider=ProviderType.DEEPSEEK,
            model="deepseek-ai/DeepSeek-V4-Flash-0731",
            reasoning_effort="off",
        )
    )

    payload = mock_post.call_args.kwargs["json"]
    assert "reasoning_effort" not in payload
