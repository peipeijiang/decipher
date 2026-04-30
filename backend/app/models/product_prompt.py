import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ProductPrompt(Base):
    __tablename__ = "product_prompts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    template_name: Mapped[str] = mapped_column(String, default="")
    variant_index: Mapped[int] = mapped_column(Integer, default=1)
    prompt_text: Mapped[str] = mapped_column(Text, default="")
    grid_layout: Mapped[str] = mapped_column(String, default="single")
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    aspect_ratio: Mapped[str] = mapped_column(String, default="16:9")
    batch_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    image_path: Mapped[str | None] = mapped_column(String, nullable=True)
    image_status: Mapped[str] = mapped_column(String, default="pending")
    video_url: Mapped[str | None] = mapped_column(String, nullable=True)
    video_path: Mapped[str | None] = mapped_column(String, nullable=True)
    video_status: Mapped[str] = mapped_column(String, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
