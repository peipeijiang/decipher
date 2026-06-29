from datetime import datetime
from pydantic import BaseModel


class VideoBase(BaseModel):
    filename: str
    platform: str = "TikTok"
    likes: str = ""
    notes: str = ""


class VideoCreate(VideoBase):
    filepath: str
    filesize: int


class VideoUpdate(BaseModel):
    platform: str | None = None
    likes: str | None = None
    notes: str | None = None


class VideoOut(VideoBase):
    id: str
    filesize: int
    duration: float | None
    frame_count: int | None = None
    status: str
    error: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
