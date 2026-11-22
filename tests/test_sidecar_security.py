"""Legacy sidecar must not start in production or without local opt-in."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from src.core.config import settings
from src.core.main import app
from src.core.schemas import MultiProviderRequest


def test_legacy_sidecar_disabled_by_default(monkeypatch):
    monkeypatch.setattr(settings, "NODE_ENV", "development")
    monkeypatch.setattr(settings, "PYTHON_CORE_ENABLED", False)
    with pytest.raises(RuntimeError, match="disabled"):
        with TestClient(app):
            pass


def test_legacy_sidecar_never_runs_in_production(monkeypatch):
    monkeypatch.setattr(settings, "NODE_ENV", "production")
    monkeypatch.setattr(settings, "PYTHON_CORE_ENABLED", True)
    with pytest.raises(RuntimeError, match="disabled"):
        with TestClient(app):
            pass


def test_python_orchestration_batch_is_bounded():
    request = {"provider": "openai", "model": "test-model", "prompt": "hello"}
    with pytest.raises(ValidationError):
        MultiProviderRequest.model_validate({"prompt": "compare", "requests": [request] * 5})
    assert len(MultiProviderRequest.model_validate({"prompt": "compare", "requests": [request] * 4}).requests) == 4
