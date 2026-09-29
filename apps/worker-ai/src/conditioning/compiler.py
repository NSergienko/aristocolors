from __future__ import annotations

import copy
import json
from datetime import UTC, datetime
from typing import Any

from src.aristocolors.types import AristoColorsProfileData

from .controlnet import ControlNetAdapter
from .diffusion import DiffusionConditioningAdapter
from .imagen import ImagenConditioningAdapter

COMPILER_VERSION = "compiler_v1.0"
_SCHEMA_VERSION = "1.0"


class ConditioningCompiler:
    def __init__(self):
        self._diffusion_adapter = DiffusionConditioningAdapter()
        self._imagen_adapter = ImagenConditioningAdapter()
        self._controlnet_adapter = ControlNetAdapter()

    def compile(
        self,
        profile: AristoColorsProfileData,
        target_provider: str,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        safe_options = copy.deepcopy(options) if options is not None else {}
        deterministic_conditioning = self._is_deterministic_conditioning(safe_options)
        compiled_at = None if deterministic_conditioning else datetime.now(UTC).isoformat().replace("+00:00", "Z")

        profile_id = getattr(profile, "profileId", None)
        metadata = self._build_metadata(target_provider, safe_options)

        result: dict[str, Any] = {
            "compilerVersion": COMPILER_VERSION,
            "schemaVersion": _SCHEMA_VERSION,
            "targetProvider": target_provider,
            "metadata": metadata,
        }

        if compiled_at is not None:
            result["compiledAt"] = compiled_at

        if isinstance(profile_id, str) and profile_id.strip():
            result["profileId"] = profile_id

        if target_provider == "diffusion_sdxl":
            result["diffusion"] = self._diffusion_adapter.compile(profile, safe_options).to_dict()
            return result

        if target_provider == "flux_1_dev":
            result["diffusion"] = self._diffusion_adapter.compile(profile, safe_options).to_dict()
            return result

        if target_provider == "imagen_3":
            result["imagen"] = self._imagen_adapter.compile(profile, safe_options).to_dict()
            return result

        if target_provider == "controlnet_inpaint":
            result["controlnet"] = self._controlnet_adapter.compile(profile, safe_options).to_dict()
            return result

        if target_provider == "all":
            result["diffusion"] = self._diffusion_adapter.compile(profile, safe_options).to_dict()
            result["imagen"] = self._imagen_adapter.compile(profile, safe_options).to_dict()
            result["controlnet"] = self._controlnet_adapter.compile(profile, safe_options).to_dict()
            return result

        supported = [
            "diffusion_sdxl",
            "imagen_3",
            "controlnet_inpaint",
            "flux_1_dev",
            "all",
        ]
        raise ValueError(
            f"Unsupported target_provider: '{target_provider}'. Supported values: {', '.join(supported)}"
        )

    def _build_metadata(self, target_provider: str, options: dict[str, Any]) -> dict[str, Any]:
        metadata: dict[str, Any] = {
            "requestedTargetProvider": target_provider,
            "providerRouting": self._provider_routing_label(target_provider),
        }

        if options:
            metadata["options"] = self._to_json_serializable(options)

        return self._ensure_json_object(metadata)

    def _provider_routing_label(self, target_provider: str) -> str:
        if target_provider == "flux_1_dev":
            return "flux_1_dev_via_diffusion_sdxl"
        return target_provider

    def _is_deterministic_conditioning(self, options: dict[str, Any]) -> bool:
        value = options.get("deterministicConditioning")
        if isinstance(value, bool):
            return value
        return False

    def _to_json_serializable(self, value: Any) -> Any:
        if value is None:
            return None

        if isinstance(value, (str, int, float, bool)):
            return value

        if isinstance(value, dict):
            return {str(key): self._to_json_serializable(val) for key, val in value.items()}

        if isinstance(value, (list, tuple)):
            return [self._to_json_serializable(item) for item in value]

        try:
            json.dumps(value)
            return value
        except TypeError:
            return str(value)

    def _ensure_json_object(self, value: Any) -> dict[str, Any]:
        serializable = self._to_json_serializable(value)
        if not isinstance(serializable, dict):
            return {"value": serializable}
        return serializable
