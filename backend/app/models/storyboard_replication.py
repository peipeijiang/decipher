import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Text, ForeignKey
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class StoryboardReplication(Base):
    __tablename__ = "storyboard_replications"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    video_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("videos.id"),
        nullable=False
    )

    # 关键帧数据
    frame_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    frame_timestamps: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )  # JSON string: [{"time": 1.5, "index": 0}, ...]
    frame_paths: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )  # JSON string: ["path/to/frame_0.jpg", ...]
    frame_metadata: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )  # JSON string: [{"shot_type": "close-up", "product_position": "center",
     #                  "scene_description": "...", "story_beat": "feature-demo"}, ...]

    # 拼接图
    storyboard_image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    layout_grid: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True
    )  # '2x2', '3x3' 等

    # 产品替换
    product_image_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    replaced_storyboard_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 提示词压缩
    original_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    compressed_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    compressed_duration: Mapped[float] = mapped_column(Float, default=15.0)

    # 状态
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending/extracting/ready/generating/completed/failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )
