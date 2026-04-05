from datetime import datetime
from pydantic import BaseModel


class ReportOut(BaseModel):
    id: str
    video_id: str
    strategy: str | None
    shots: str | None
    prompt: str | None
    script: str | None
    script_segments: str | None = None  # JSON array of {start, end, text}
    frame_urls: list[str] | None = None  # Frame image URLs
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportUpdate(BaseModel):
    notes: str | None = None


# ── Config schemas ────────────────────────────────────────────────────────────

class ProviderConfigOut(BaseModel):
    """Per-provider config returned to the frontend (no api_key)."""
    configured: bool = False
    endpoint: str = ""
    vision_model: str = ""
    text_model: str = ""


class ModelConfigOut(BaseModel):
    id: str
    vision_model: str
    analysis_model: str
    providers: dict[str, ProviderConfigOut] = {}
    temperature: float = 0.7
    max_tokens: int = 4096
    updated_at: datetime


class ProviderUpdate(BaseModel):
    """Per-provider fields accepted in PATCH /api/config/models."""
    api_key: str | None = None
    endpoint: str | None = None
    vision_model: str | None = None
    text_model: str | None = None


class ModelConfigUpdate(BaseModel):
    vision_model: str | None = None
    analysis_model: str | None = None
    providers: dict[str, ProviderUpdate] | None = None
    temperature: float | None = None
    max_tokens: int | None = None


SUPPORTED_MODELS = ["doubao", "openai", "claude", "minimax", "zhipu", "deepseek"]
