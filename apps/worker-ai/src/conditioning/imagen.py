from __future__ import annotations

from typing import Any

from src.aristocolors.types import AristoColorsProfileData

from .base import BaseConditioningAdapter, ImagenDirectives


_DEFAULT_BASE_PROMPT = "Generate an AristoColors-aligned interior transformation with polished realism and coherent styling"
_DEFAULT_ASPECT_RATIO = None
_DEFAULT_GUIDANCE_SCALE = None


class ImagenConditioningAdapter(BaseConditioningAdapter):
    provider = "imagen_3"

    def compile(
        self,
        profile: AristoColorsProfileData,
        options: dict[str, Any] | None = None,
    ) -> ImagenDirectives:
        opts = options or {}

        base_prompt = self._get_string_option(opts, "basePrompt", _DEFAULT_BASE_PROMPT)
        aspect_ratio = self._get_optional_string_option(opts, "aspectRatio", _DEFAULT_ASPECT_RATIO)
        guidance_scale = self._get_optional_positive_float_option(opts, "guidanceScale", _DEFAULT_GUIDANCE_SCALE)

        natural_language_atmosphere = self._build_natural_language_atmosphere(profile, base_prompt)
        lighting_directive = self._build_lighting_directive(profile)
        color_palette_directive = self._build_color_palette_directive(profile)
        texture_directive = self._build_texture_directive(profile)

        combined_prompt = ". ".join(
            [
                natural_language_atmosphere,
                lighting_directive,
                color_palette_directive,
                texture_directive,
            ]
        )

        return ImagenDirectives(
            provider=self.provider,
            natural_language_atmosphere=natural_language_atmosphere,
            lighting_directive=lighting_directive,
            color_palette_directive=color_palette_directive,
            texture_directive=texture_directive,
            aspect_ratio=aspect_ratio,
            safety_settings=None,
            guidance_scale=guidance_scale,
            combined_prompt=combined_prompt,
        )

    def _build_natural_language_atmosphere(self, profile: AristoColorsProfileData, base_prompt: str) -> str:
        lighting = profile.inferredFeatures.lighting
        temperature = "neutral"
        brightness_phrase = "balanced brightness"

        if lighting is not None:
            if lighting.temperature:
                temperature = lighting.temperature.strip().lower() or "neutral"
            brightness_phrase = self._brightness_phrase(lighting.brightness)

        return f"{base_prompt}. Maintain a {temperature} atmosphere with {brightness_phrase}"

    def _build_lighting_directive(self, profile: AristoColorsProfileData) -> str:
        lighting = profile.inferredFeatures.lighting
        if lighting is None:
            return "Use balanced ambient illumination with soft natural falloff"

        azimuth_deg = self._coerce_float_from_mapping(lighting.brightness, "azimuthDeg")
        elevation_deg = self._coerce_float_from_mapping(lighting.brightness, "elevationDeg")

        direction_phrase = self._direction_phrase(azimuth_deg, elevation_deg)
        uniformity_phrase = self._uniformity_phrase(lighting.uniformity)
        ambient_phrase = self._ambient_phrase(lighting.ambientFillRatio)

        return (
            f"Use {uniformity_phrase} with {ambient_phrase}; "
            f"keep the lighting {direction_phrase} and preserve contrast at {lighting.contrastRatio}"
        )

    def _build_color_palette_directive(self, profile: AristoColorsProfileData) -> str:
        dominant_colors = profile.deterministicFeatures.dominantColors
        palette = [color.hex.strip().lower() for color in dominant_colors[:5] if color.hex.strip()]
        if not palette:
            return "Use a balanced, harmonious AristoColors palette"

        return "Use a harmonious palette anchored by " + ", ".join(palette)

    def _build_texture_directive(self, profile: AristoColorsProfileData) -> str:
        texture = profile.deterministicFeatures.textureAnalysis
        surface_normals = profile.inferredFeatures.surfaceNormals

        texture_phrase = "preserve believable material texture"
        if texture is not None:
            if texture.edgeDensity < 0.08:
                texture_phrase = "preserve smooth low-detail materials"
            elif texture.edgeDensity < 0.18:
                texture_phrase = "preserve balanced mid-detail materials"
            else:
                texture_phrase = "preserve rich tactile materials"

            texture_phrase += f" with contrast around {texture.contrastRatio}"

        if surface_normals is not None and surface_normals.dominantFacing.strip():
            facing = surface_normals.dominantFacing.strip().lower()
            texture_phrase += f", especially across {facing}-facing surfaces"

        return texture_phrase

    def _brightness_phrase(self, brightness: dict[str, Any]) -> str:
        if not isinstance(brightness, dict):
            return "balanced brightness"

        mean_value = brightness.get("mean")
        try:
            mean_float = float(mean_value)
        except (TypeError, ValueError):
            return "balanced brightness"

        if mean_float < 0.33:
            return "a low-key brightness profile"
        if mean_float < 0.66:
            return "a balanced brightness profile"
        return "a bright open brightness profile"

    def _direction_phrase(self, azimuth_deg: float | None, elevation_deg: float | None) -> str:
        if azimuth_deg is None and elevation_deg is None:
            return "softly balanced"

        parts: list[str] = []
        if azimuth_deg is not None:
            parts.append(f"azimuth {azimuth_deg:.1f}deg")
        if elevation_deg is not None:
            parts.append(f"elevation {elevation_deg:.1f}deg")
        return "directionally informed by " + " and ".join(parts)

    def _uniformity_phrase(self, uniformity: float) -> str:
        if uniformity >= 0.8:
            return "highly even illumination"
        if uniformity >= 0.55:
            return "balanced illumination"
        return "more directional illumination"

    def _ambient_phrase(self, ambient_fill_ratio: float) -> str:
        if ambient_fill_ratio >= 0.75:
            return "strong ambient fill"
        if ambient_fill_ratio >= 0.45:
            return "moderate ambient fill"
        return "limited ambient fill"

    def _get_string_option(self, options: dict[str, Any], key: str, default: str) -> str:
        value = options.get(key)
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                return stripped
        return default

    def _get_optional_string_option(
        self,
        options: dict[str, Any],
        key: str,
        default: str | None,
    ) -> str | None:
        value = options.get(key)
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                return stripped
        return default

    def _get_optional_positive_float_option(
        self,
        options: dict[str, Any],
        key: str,
        default: float | None,
    ) -> float | None:
        value = options.get(key)
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return default
        if parsed > 0:
            return parsed
        return default

    def _coerce_float_from_mapping(self, value: Any, key: str) -> float | None:
        if not isinstance(value, dict):
            return None
        raw = value.get(key)
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None
