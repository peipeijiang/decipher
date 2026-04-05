import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # 模型选择
    vision_model: Mapped[str] = mapped_column(String, default="openai")
    analysis_model: Mapped[str] = mapped_column(String, default="openai")
    
    # OpenAI
    openai_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    openai_endpoint: Mapped[str | None] = mapped_column(Text, nullable=True)
    openai_vision_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    openai_text_model: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Claude
    anthropic_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    anthropic_endpoint: Mapped[str | None] = mapped_column(Text, nullable=True)
    claude_vision_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    claude_text_model: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 豆包
    doubao_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    doubao_endpoint: Mapped[str | None] = mapped_column(Text, nullable=True)
    doubao_region: Mapped[str | None] = mapped_column(Text, nullable=True)
    doubao_vision_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    doubao_text_model: Mapped[str | None] = mapped_column(Text, nullable=True)

    # MiniMax
    minimax_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    minimax_endpoint: Mapped[str | None] = mapped_column(Text, nullable=True)
    minimax_vision_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    minimax_text_model: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 智谱
    zhipu_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    zhipu_endpoint: Mapped[str | None] = mapped_column(Text, nullable=True)
    zhipu_vision_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    zhipu_text_model: Mapped[str | None] = mapped_column(Text, nullable=True)

    # DeepSeek
    deepseek_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    deepseek_endpoint: Mapped[str | None] = mapped_column(Text, nullable=True)
    deepseek_text_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # 全局参数
    temperature: Mapped[float] = mapped_column(String, default=0.7)
    max_tokens: Mapped[int] = mapped_column(String, default=4096)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
