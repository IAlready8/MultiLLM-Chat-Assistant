import pytest
from pydantic import ValidationError

import src.core.llm_manager as llm_manager_module
import src.core.providers as providers_module
from src.core.llm_manager import LLMManager, ProviderType
from src.core.schemas import ProviderRequest
from src.core.security_utils import validate_model_name, validate_provider_type


def test_official_deepseek_model_ids_are_valid_without_allowing_paths():
    assert validate_model_name("deepseek-v4-flash")
    assert validate_model_name("deepseek-v4-pro")
    assert not validate_model_name("../deepseek-v4-flash")
    assert not validate_model_name("deepseek/models/deepseek-v4-flash")


def test_python_sidecar_has_no_deepseek_network_adapter():
    assert not hasattr(llm_manager_module, "DeepSeekProvider")
    assert not validate_provider_type("deepseek")


@pytest.mark.asyncio
async def test_python_sidecar_does_not_register_deepseek(monkeypatch):
    isolated_manager = LLMManager()
    monkeypatch.setattr(providers_module, "llm_manager", isolated_manager)
    monkeypatch.setattr(providers_module.settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(providers_module.settings, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(providers_module.settings, "GOOGLE_AI_API_KEY", None)
    monkeypatch.setattr(providers_module.settings, "MOONSHOT_API_KEY", None)

    await providers_module.initialize_providers()

    assert ProviderType.DEEPSEEK not in isolated_manager.health_check()


def test_direct_sidecar_deepseek_request_is_rejected_by_schema():
    with pytest.raises(ValidationError):
        ProviderRequest(
            provider="deepseek",
            model="deepseek-v4-flash",
            prompt="Test prompt",
            reasoning_effort="high",
        )


def test_deepseek_cost_is_reported_as_provider_billed():
    assert providers_module.calculate_cost(ProviderType.DEEPSEEK, 1_000) is None
