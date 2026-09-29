from __future__ import annotations

from typing import Any

from src.aristocolors.types import AristoColorsProfileData

from .base import BaseConditioningAdapter, DiffusionDirectives


_DEFAULT_BASE_PROMPT = "AristoColors interior transformation, cohesive design language, photorealistic finish"
_DEFAULT_NEGATIVE_PROMPT = (
    "low quality, blurry, distorted perspective, warped geometry, bad anatomy, "
    "oversaturated colors, noisy texture, artifacts, text, watermark"
)
_DEFAULT_CFG_SCALE = 6.5
_DEFAULT_CLIP_SKIP = 2
_DEFAULT_STEPS = 30
_DEFAULT_SAMPLER_NAME = "DPM++ 2M Karras"
_DEFAULT_HARMONIZATION_INTENSITY = 0.85


class DiffusionConditioningAdapter(BaseConditioningAdapter):
    provider = "diffusion_sdxl"

    def compile(
        self,
        profile: AristoColorsProfileData,
        options: dict[str, Any] | None = None,
    ) -> DiffusionDirectives:
        opts = options or {}

        base_prompt = self._get_string_option(opts, "basePrompt", _DEFAULT_BASE_PROMPT)
        steps = self._get_positive_int_option(opts, "steps", _DEFAULT_STEPS)
        harmonization_intensity = self._get_bounded_float_option(
            opts,
            "harmonizationIntensity",
            _DEFAULT_HARMONIZATION_INTENSITY,
        )

        palette_keywords = self._build_palette_keywords(profile)
        lighting_prompt = self._build_lighting_prompt(profile)
        texture_prompt = self._build_texture_prompt(profile)

        positive_parts = [base_prompt]
        if palette_keywords:
            positive_parts.append("palette accents: " + ", ".join(palette_keywords))
        if lighting_prompt:
            positive_parts.append(lighting_prompt)
        if texture_prompt:
            positive_parts.append(texture_prompt)

        positive_prompt = ", ".join(part for part in positive_parts if part)

        return DiffusionDirectives(
            provider=self.provider,
            positive_prompt=positive_prompt,
            negative_prompt=_DEFAULT_NEGATIVE_PROMPT,
            lora_triggers=[],
            cfg_scale=_DEFAULT_CFG_SCALE,
            clip_skip=_DEFAULT_CLIP_SKIP,
            controlnet_inpaint_weight=harmonization_intensity,
            steps=steps,
            sampler_name=_DEFAULT_SAMPLER_NAME,
            palette_keywords=palette_keywords,
            lighting_prompt=lighting_prompt,
            texture_prompt=texture_prompt,
        )

    def _build_palette_keywords(self, profile: AristoColorsProfileData) -> list[str]:
        if isinstance(profile, dict):
            det = profile.get("deterministicFeatures", {})
            dominant_colors = det.get("dominantColors", []) if isinstance(det, dict) else getattr(det, "dominantColors", [])
        else:
            det = getattr(profile, "deterministicFeatures", None)
            dominant_colors = getattr(det, "dominantColors", []) if det else []

        keywords: list[str] = []
        for color in dominant_colors[:5]:
            if isinstance(color, dict):
                raw_value = color.get("hex", "")
            else:
                raw_value = getattr(color, "hex", "")
            value = raw_value.strip().lower() if isinstance(raw_value, str) else ""
            if value:
                keywords.append(value)
        return keywords

    def _build_lighting_prompt(self, profile: AristoColorsProfileData) -> str:
        inferred = self._get_profile_value(profile, "inferredFeatures")
        lighting = self._get_profile_value(inferred, "lighting")
        if lighting is None:
            return "balanced ambient lighting"

        temperature_raw = self._get_profile_value(lighting, "temperature")
        temperature = temperature_raw.strip() if isinstance(temperature_raw, str) and temperature_raw.strip() else "neutral"

        uniformity_raw = self._get_profile_value(lighting, "uniformity")
        uniformity = float(uniformity_raw) if isinstance(uniformity_raw, (int, float)) else 0.0

        ambient_fill_ratio_raw = self._get_profile_value(lighting, "ambientFillRatio")
        ambient_fill_ratio = (
            float(ambient_fill_ratio_raw) if isinstance(ambient_fill_ratio_raw, (int, float)) else 0.0
        )

        contrast_ratio_raw = self._get_profile_value(lighting, "contrastRatio")
        contrast_ratio = (
            contrast_ratio_raw.strip()
            if isinstance(contrast_ratio_raw, str) and contrast_ratio_raw.strip()
            else "balanced contrast"
        )

        brightness = self._get_profile_value(lighting, "brightness")
        azimuth_deg = self._coerce_float_from_mapping(brightness, "azimuthDeg")
        elevation_deg = self._coerce_float_from_mapping(brightness, "elevationDeg")

        direction_phrase = self._format_direction_phrase(azimuth_deg, elevation_deg)
        uniformity_phrase = self._format_uniformity_phrase(uniformity)
        ambient_phrase = self._format_ambient_phrase(ambient_fill_ratio)

        parts = [
            f"{temperature} lighting",
            uniformity_phrase,
            ambient_phrase,
            f"contrast {contrast_ratio}",
            direction_phrase,
        ]
        return ", ".join(part for part in parts if part)

    def _build_texture_prompt(self, profile: AristoColorsProfileData) -> str:
        deterministic = self._get_profile_value(profile, "deterministicFeatures")
        texture = self._get_profile_value(deterministic, "textureAnalysis")
        if texture is None:
            return "refined material texture"

        edge_density_raw = self._get_profile_value(texture, "edgeDensity")
        edge_density = float(edge_density_raw) if isinstance(edge_density_raw, (int, float)) else 0.0

        entropy_raw = self._get_profile_value(texture, "entropy")
        entropy = float(entropy_raw) if isinstance(entropy_raw, (int, float)) else 0.0

        contrast_ratio_raw = self._get_profile_value(texture, "contrastRatio")
        contrast_ratio = str(contrast_ratio_raw) if contrast_ratio_raw is not None else "balanced"

        detail_phrase = self._format_edge_density_phrase(edge_density)
        entropy_phrase = self._format_entropy_phrase(entropy)
        contrast_phrase = f"surface contrast {contrast_ratio}"

        parts = [detail_phrase, entropy_phrase, contrast_phrase]
        return ", ".join(part for part in parts if part)

    def _format_direction_phrase(self, azimuth_deg: float | None, elevation_deg: float | None) -> str:
        if azimuth_deg is None and elevation_deg is None:
            return "soft directional balance"

        direction_parts: list[str] = []
        if azimuth_deg is not None:
            direction_parts.append(f"azimuth {azimuth_deg:.1f}deg")
        if elevation_deg is not None:
            direction_parts.append(f"elevation {elevation_deg:.1f}deg")
        return "light direction " + ", ".join(direction_parts)

    def _format_uniformity_phrase(self, uniformity: float) -> str:
        if uniformity >= 0.8:
            return "highly even illumination"
        if uniformity >= 0.55:
            return "balanced illumination"
        return "directional illumination"

    def _format_ambient_phrase(self, ambient_fill_ratio: float) -> str:
        if ambient_fill_ratio >= 0.75:
            return "strong ambient fill"
        if ambient_fill_ratio >= 0.45:
            return "moderate ambient fill"
        return "limited ambient fill"

    def _format_edge_density_phrase(self, edge_density: float) -> str:
        if edge_density < 0.08:
            return "smooth low-detail surfaces"
        if edge_density < 0.18:
            return "balanced surface detail"
        return "rich high-frequency surface detail"

    def _format_entropy_phrase(self, entropy: float) -> str:
        if entropy < 4.0:
            return "clean material simplicity"
        if entropy < 6.5:
            return "moderately varied material texture"
        return "complex textured material variation"

    def _get_string_option(self, options: dict[str, Any], key: str, default: str) -> str:
        value = options.get(key)
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                return stripped
        return default

    def _get_positive_int_option(self, options: dict[str, Any], key: str, default: int) -> int:
        value = options.get(key)
        if isinstance(value, bool):
            return default
        if isinstance(value, int) and value > 0:
            return value
        if isinstance(value, float) and value.is_integer() and value > 0:
            return int(value)
        return default

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

    def _coerce_float_from_mapping(self, value: Any, key: str) -> float | None:
        if isinstance(value, dict):
            raw = value.get(key)
        else:
            raw = getattr(value, key, None)
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None

    def _get_profile_value(self, value: Any, key: str) -> Any:
        if value is None:
            return None
        if isinstance(value, dict):
            return value.get(key)
        return getattr(value, key, None)
