from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from src.aristocolors.types import AristoColorsProfileData


@dataclass(frozen=True)
class DiffusionDirectives:
    provider: str
    positive_prompt: str
    negative_prompt: str
    lora_triggers: list[str] = field(default_factory=list)
    cfg_scale: float = 6.5
    clip_skip: int = 2
    controlnet_inpaint_weight: float = 0.85
    steps: int = 30
    sampler_name: str = "DPM++ 2M Karras"
    palette_keywords: list[str] = field(default_factory=list)
    lighting_prompt: str = ""
    texture_prompt: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "positivePrompt": self.positive_prompt,
            "negativePrompt": self.negative_prompt,
            "loraTriggers": list(self.lora_triggers),
            "cfgScale": self.cfg_scale,
            "clipSkip": self.clip_skip,
            "controlnetInpaintWeight": self.controlnet_inpaint_weight,
            "steps": self.steps,
            "samplerName": self.sampler_name,
            "paletteKeywords": list(self.palette_keywords),
            "lightingPrompt": self.lighting_prompt,
            "texturePrompt": self.texture_prompt,
        }


@dataclass(frozen=True)
class ImagenDirectives:
    provider: str
    natural_language_atmosphere: str
    lighting_directive: str
    color_palette_directive: str
    texture_directive: str
    aspect_ratio: str | None = None
    safety_settings: dict[str, str] | None = None
    guidance_scale: float | None = None
    combined_prompt: str = ""

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "provider": self.provider,
            "naturalLanguageAtmosphere": self.natural_language_atmosphere,
            "lightingDirective": self.lighting_directive,
            "colorPaletteDirective": self.color_palette_directive,
            "textureDirective": self.texture_directive,
            "combinedPrompt": self.combined_prompt,
        }
        if self.aspect_ratio is not None:
            payload["aspectRatio"] = self.aspect_ratio
        if self.safety_settings is not None:
            payload["safetySettings"] = dict(self.safety_settings)
        if self.guidance_scale is not None:
            payload["guidanceScale"] = self.guidance_scale
        return payload


@dataclass(frozen=True)
class ControlNetDirectives:
    provider: str
    preprocessor: str
    controlnet_weight: float
    ip_adapter_scale: float
    starting_control_step: float
    ending_control_step: float
    control_mode: str
    mask_blur: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "preprocessor": self.preprocessor,
            "controlnetWeight": self.controlnet_weight,
            "ipAdapterScale": self.ip_adapter_scale,
            "startingControlStep": self.starting_control_step,
            "endingControlStep": self.ending_control_step,
            "controlMode": self.control_mode,
            "maskBlur": self.mask_blur,
        }


class BaseConditioningAdapter(ABC):
    @abstractmethod
    def compile(
        self,
        profile: AristoColorsProfileData,
        options: dict[str, Any] | None = None,
    ) -> DiffusionDirectives | ImagenDirectives | ControlNetDirectives:
        raise NotImplementedError
