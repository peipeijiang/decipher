import json
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # Active provider selection
    vision_model: Mapped[str] = mapped_column(String, default="openai")
    analysis_model: Mapped[str] = mapped_column(String, default="openai")
    image_model: Mapped[str] = mapped_column(String, default="gpt-image-2-vip")
    video_gen_model: Mapped[str] = mapped_column(String, default="seedance-2.0")

    # All provider configs as a single JSON blob:
    # {"openai": {"api_key": "", "endpoint": "", "vision_model": "", "text_model": ""}, ...}
    config_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Global parameters
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_providers(self) -> dict:
        """Return parsed config_json dict, empty dict on missing/invalid."""
        if not self.config_json:
            return {}
        try:
            return json.loads(self.config_json)
        except Exception:
            return {}

    def set_providers(self, data: dict) -> None:
        self.config_json = json.dumps(data, ensure_ascii=False)
