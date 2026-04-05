import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import Base, engine
from app.api.videos import router as videos_router
from app.api.reports import router as reports_router, config_router
from app.api.segments import router as segments_router
from app.models.config import ModelConfig  # noqa: F401 - registers with Base.metadata

logging.basicConfig(level=logging.INFO)


def _migrate():
    """Add new columns to existing tables without a migration framework."""
    new_cols = [
        ("segments", "analysis_status", "TEXT"),
        ("segments", "prompt", "TEXT"),
        ("segments", "strategy", "TEXT"),
        ("segments", "shots", "TEXT"),
        # model_configs new columns
        ("model_configs", "openai_api_key", "TEXT"),
        ("model_configs", "openai_endpoint", "TEXT"),
        ("model_configs", "anthropic_api_key", "TEXT"),
        ("model_configs", "anthropic_endpoint", "TEXT"),
        ("model_configs", "doubao_api_key", "TEXT"),
        ("model_configs", "doubao_endpoint", "TEXT"),
        ("model_configs", "doubao_region", "TEXT"),
        ("model_configs", "minimax_api_key", "TEXT"),
        ("model_configs", "minimax_endpoint", "TEXT"),
        ("model_configs", "zhipu_api_key", "TEXT"),
        ("model_configs", "zhipu_endpoint", "TEXT"),
        ("model_configs", "deepseek_api_key", "TEXT"),
        ("model_configs", "deepseek_endpoint", "TEXT"),
        ("model_configs", "temperature", "FLOAT DEFAULT 0.7"),
        ("model_configs", "max_tokens", "INTEGER DEFAULT 4096"),
        ("model_configs", "created_at", "DATETIME"),
        # model name overrides
        ("model_configs", "openai_vision_model", "TEXT"),
        ("model_configs", "openai_text_model", "TEXT"),
        ("model_configs", "claude_vision_model", "TEXT"),
        ("model_configs", "claude_text_model", "TEXT"),
        ("model_configs", "doubao_vision_model", "TEXT"),
        ("model_configs", "doubao_text_model", "TEXT"),
        ("model_configs", "minimax_vision_model", "TEXT"),
        ("model_configs", "minimax_text_model", "TEXT"),
        ("model_configs", "zhipu_vision_model", "TEXT"),
        ("model_configs", "zhipu_text_model", "TEXT"),
        ("model_configs", "deepseek_text_model", "TEXT"),
    ]
    with engine.connect() as conn:
        for table, col, col_type in new_cols:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                pass  # column already exists


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate()
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("processed", exist_ok=True)
    yield


app = FastAPI(title="TikTok Analyzer API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(videos_router)
app.include_router(reports_router)
app.include_router(config_router)
app.include_router(segments_router)


@app.get("/health")
def health():
    return {"status": "ok"}
