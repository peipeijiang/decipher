from datetime import datetime
from pydantic import BaseModel


class ReportOut(BaseModel):
    id: str
    video_id: str
    strategy: str | None
    shots: str | None
    prompt: str | None
    script: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportUpdate(BaseModel):
    notes: str | None = None


class ModelConfigOut(BaseModel):
    id: str
    vision_model: str
    analysis_model: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModelConfigUpdate(BaseModel):
    vision_model: str | None = None
    analysis_model: str | None = None


SUPPORTED_MODELS = [
    "doubao",
    "openai",
    "claude",
    "minimax",
    "zhipu",
    "deepseek",
]
