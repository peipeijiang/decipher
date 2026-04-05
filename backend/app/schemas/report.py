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
    # API Keys - masked for security
    openai_configured: bool = False
    claude_configured: bool = False
    doubao_configured: bool = False
    minimax_configured: bool = False
    zhipu_configured: bool = False
    deepseek_configured: bool = False
    # Endpoints (null = use default)
    openai_endpoint: str | None = None
    claude_endpoint: str | None = None
    doubao_endpoint: str | None = None
    minimax_endpoint: str | None = None
    zhipu_endpoint: str | None = None
    deepseek_endpoint: str | None = None
    # Global params
    temperature: float = 0.7
    max_tokens: int = 4096
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModelConfigUpdate(BaseModel):
    # Model selection
    vision_model: str | None = None
    analysis_model: str | None = None
    # API Keys (only update if non-empty)
    openai_api_key: str | None = None
    claude_api_key: str | None = None
    doubao_api_key: str | None = None
    minimax_api_key: str | None = None
    zhipu_api_key: str | None = None
    deepseek_api_key: str | None = None
    # Endpoints
    openai_endpoint: str | None = None
    claude_endpoint: str | None = None
    doubao_endpoint: str | None = None
    minimax_endpoint: str | None = None
    zhipu_endpoint: str | None = None
    deepseek_endpoint: str | None = None
    # Global params
    temperature: float | None = None
    max_tokens: int | None = None


SUPPORTED_MODELS = [
    "doubao",
    "openai",
    "claude",
    "minimax",
    "zhipu",
    "deepseek",
]
