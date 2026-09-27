from __future__ import annotations

from typing import Any

from src.aristocolors.types import AristoColorsProfileData

from .base import BaseConditioningAdapter, ControlNetDirectives


_DEFAULT_PREPROCESSOR = "inpaint_only+lama"
_DEFAULT_CONTROL_MODE = "balanced"
_DEFAULT_IP_ADAPTER_SCALE = 0.75
_DEFAULT_HARMONIZATION_INTENSITY = 0.85
_DEFAULT_EDGE_BLEED_RADIUS_PX = 8.0
_DEFAULT_STARTING_CONTROL_STEP = 0.0
_DEFAULT_ENDING_CONTROL_STEP = 1.0


class ControlNetAdapter(BaseConditioningAdapter):
    provider = "controlnet_inpaint"

    def compile(
        self,
        profile: AristoColorsProfileData,
        options: dict[str, Any] | None = None,
    ) -> ControlNetDirectives:
        opts = options or {}

        controlnet_weight = self._get_bounded_float_option(
            opts,
            "harmonizationIntensity",
            _DEFAULT_HARMONIZATION_INTENSITY,
        )
        ip_adapter_scale = self._get_bounded_float_option(
            opts,
            "ipAdapterScale",
            _DEFAULT_IP_ADAPTER_SCALE,
        )
        mask_blur = self._get_mask_blur(profile)

        return ControlNetDirectives(
            provider=self.provider,
            preprocessor=_DEFAULT_PREPROCESSOR,
            controlnet_weight=controlnet_weight,
            ip_adapter_scale=ip_adapter_scale,
            starting_control_step=_DEFAULT_STARTING_CONTROL_STEP,
            ending_control_step=_DEFAULT_ENDING_CONTROL_STEP,
            control_mode=_DEFAULT_CONTROL_MODE,
            mask_blur=mask_blur,
        )

    def _get_mask_blur(self, profile: AristoColorsProfileData) -> float:
        texture = profile.deterministicFeatures.textureAnalysis
        if texture is None:
            return _DEFAULT_EDGE_BLEED_RADIUS_PX

        raw_value = getattr(texture, "edgeBleedRadiusPx", _DEFAULT_EDGE_BLEED_RADIUS_PX)
        try:
            parsed = float(raw_value)
        except (TypeError, ValueError):
            parsed = _DEFAULT_EDGE_BLEED_RADIUS_PX
        return max(0.0, parsed)

    def _get_bounded_float_option(
        self,
        options: dict[str, Any],
        key: str,
        default: float,
    ) -> float:
        value = options.get(key)
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            parsed = default
        return max(0.0, min(1.0, parsed))
