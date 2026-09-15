"""
Capability loader aligned to config/capability-matrix.yaml.

The matrix is the only human-edited provider truth. This module intentionally
parses the repo-owned YAML shape directly to avoid adding a Python YAML
dependency for the optional sidecar.
"""

from functools import lru_cache
from pathlib import Path
from typing import Any


MATRIX_PATH = Path(__file__).resolve().parents[2] / "config" / "capability-matrix.yaml"


def _parse_scalar(value: str) -> Any:
    trimmed = value.strip()
    if trimmed == "true":
        return True
    if trimmed == "false":
        return False
    if trimmed.startswith("{") and trimmed.endswith("}"):
        parts: dict[str, float] = {}
        for segment in trimmed[1:-1].split(","):
            key, raw = segment.split(":", 1)
            parts[key.strip()] = float(raw.strip())
        return parts
    try:
        if "." in trimmed:
            return float(trimmed)
        return int(trimmed)
    except ValueError:
        return trimmed.strip("\"'")


@lru_cache(maxsize=1)
def load_capability_matrix() -> list[dict[str, Any]]:
    """Load provider entries from the canonical matrix."""
    providers: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    in_providers = False

    for line in MATRIX_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped == "providers:":
            in_providers = True
            continue

        if in_providers and line and not line.startswith(" ") and stripped.endswith(":"):
            break

        if not in_providers:
            continue

        if line.startswith("  - id:"):
            current = {"id": _parse_scalar(line.split(":", 1)[1])}
            providers.append(current)
            continue

        if current is not None and line.startswith("    ") and ":" in line:
            key, raw = line.strip().split(":", 1)
            current[key] = _parse_scalar(raw)

    _validate_matrix(providers)
    return providers


def _validate_matrix(providers: list[dict[str, Any]]) -> None:
    seen: set[str] = set()
    required = {
        "id",
        "streaming",
        "supports_tools",
        "requires_api_key",
        "default_model",
        "cost_per_1k",
    }
    for provider in providers:
        missing = required - provider.keys()
        if missing:
            raise ValueError(f"Provider matrix entry is missing: {', '.join(sorted(missing))}")
        provider_id = str(provider["id"])
        if provider_id in seen:
            raise ValueError(f"Duplicate provider id in matrix: {provider_id}")
        seen.add(provider_id)


def get_all_providers() -> list[str]:
    """Return known IDs, including providers retained for compatibility."""
    return [str(provider["id"]) for provider in load_capability_matrix()]


def get_supported_providers() -> list[str]:
    """Return operational IDs; sidecar registration is checked separately."""
    return [str(provider["id"]) for provider in load_capability_matrix() if provider.get("operational", True)]


def get_capabilities(provider: str) -> dict[str, Any]:
    """Return capability flags for a provider."""
    normalized = provider.lower()
    for entry in load_capability_matrix():
        if entry["id"] == normalized:
            return {
                "streaming": bool(entry["streaming"]),
                "supports_tools": bool(entry["supports_tools"]),
                "requires_api_key": bool(entry["requires_api_key"]),
                "default_model": str(entry["default_model"]),
            }
    return {
        "streaming": False,
        "supports_tools": False,
        "requires_api_key": True,
        "default_model": "",
    }


def get_cost_rate(provider: str) -> dict[str, float]:
    """Return prompt/completion cost per 1k tokens for a provider."""
    normalized = provider.lower()
    for entry in load_capability_matrix():
        if entry["id"] == normalized:
            cost = entry["cost_per_1k"]
            if isinstance(cost, dict):
                return {
                    "prompt": float(cost.get("prompt", 0.01)),
                    "completion": float(cost.get("completion", 0.01)),
                }
    return {"prompt": 0.01, "completion": 0.01}


def is_supported(provider: str) -> bool:
    normalized = provider.lower()
    if normalized == "google":
        normalized = "googleai"
    return normalized in get_supported_providers()
