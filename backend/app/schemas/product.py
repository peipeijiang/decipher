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

    model_config = {"from_attributes": True}


class ProductPromptOut(BaseModel):
    id: str
    product_id: str
    template_name: str
    variant_index: int
    prompt_text: str
    image_url: str | None = None
    image_status: str
    video_url: str | None = None
    video_status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductDocOut(BaseModel):
    title: str
    description: str
    appearance: str
    usage: str
    selling_points: str
    images: list[dict]
