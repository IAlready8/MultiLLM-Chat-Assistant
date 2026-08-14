from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError

from src.core import providers as provider_module
from src.core.llm_manager import DeepSeekProvider, ProviderType
from src.core.providers import calculate_cost
from src.core.schemas import ProviderRequest, ProviderStreamRequest
from src.core.security_utils import validate_provider_type


def test_deepseek_is_rejected_by_sidecar_request_schemas():
    with pytest.raises(ValidationError):
        ProviderRequest(
            provider="deepseek",
            model="deepseek-ai/DeepSeek-V4-Flash-0731",
            prompt="hello",
        )

    with pytest.raises(ValidationError):
        ProviderStreamRequest(
            provider="deepseek",
            model="deepseek-ai/DeepSeek-V4-Flash-0731",
            messages=[{"role": "user", "content": "hello"}],
        )


def test_deepseek_is_not_an_allowed_operational_provider():
    assert not validate_provider_type("deepseek")
    assert validate_provider_type("openai")


@pytest.mark.asyncio
async def test_initialize_providers_does_not_register_deepseek():
    with patch.object(
        provider_module.llm_manager,
        "register_provider",
        new_callable=AsyncMock,
    ) as register_provider:
        await provider_module.initialize_providers()

    registered_provider_types = [call.args[0] for call in register_provider.call_args_list]
    assert ProviderType.DEEPSEEK not in registered_provider_types


def test_deepseek_is_not_reported_as_free_while_disabled():
    with pytest.raises(ValueError, match="DeepSeek is currently unavailable"):
        calculate_cost(ProviderType.DEEPSEEK, 1000)


def test_historical_adapter_class_remains_available_for_future_restoration():
    assert DeepSeekProvider.__name__ == "DeepSeekProvider"
