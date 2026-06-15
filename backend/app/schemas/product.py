from datetime import datetime
from pydantic import BaseModel


class ProductCreate(BaseModel):
    url: str


class ProductOut(BaseModel):
    id: str
    url: str
    title: str
    description: str
    status: str
    error_message: str | None = None
    archive_status: str
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    instruction_board_status: str = "none"
    instruction_board_path: str | None = None

    model_config = {"from_attributes": True}


class ProductPromptOut(BaseModel):
    id: str
    product_id: str
    template_name: str
    variant_index: int
    prompt_text: str
    image_prompt: str | None = None
    image_url: str | None = None
    image_status: str
    video_url: str | None = None
    video_status: str
    grid_layout: str = "single"
    aspect_ratio: str = "16:9"
    video_style: str = "grwm"
    hook_key: str | None = None
    video_model: str = "happyhorse-1.0"
    video_duration: int = 15
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductDocOut(BaseModel):
    title: str
    description: str
    appearance: str
    usage: str
    selling_points: str
    images: list[dict]
