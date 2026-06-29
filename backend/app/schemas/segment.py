from datetime import datetime
from pydantic import BaseModel


class SegmentCreate(BaseModel):
    start_time: float
    end_time: float
    label: str = ""


class SegmentOut(BaseModel):
    id: str
    video_id: str
    start_time: float
    end_time: float
    label: str
    analysis: str | None
    analysis_status: str | None
    prompt: str | None
    strategy: str | None
    shots: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
