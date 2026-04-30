import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AutoPipelineConfig(Base):
    __tablename__ = "auto_pipeline_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_generate_images: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_generate_videos: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_archive_after_days: Mapped[int] = mapped_column(Integer, default=30)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
