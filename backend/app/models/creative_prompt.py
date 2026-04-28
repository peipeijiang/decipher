"""Creative prompt history model."""
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from app.database import Base


class CreativePrompt(Base):
    __tablename__ = "creative_prompts"

    id = Column(String, primary_key=True)
    description = Column(Text, nullable=False)
    image_path = Column(String, nullable=True)
    results = Column(Text, nullable=False)  # JSON string of angles + prompts
    video_id = Column(String, ForeignKey("videos.id"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
