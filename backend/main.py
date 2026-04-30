import json
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
from app.api.creative import router as creative_router
from app.api.products import router as products_router
from app.models.config import ModelConfig  # noqa: F401 - registers with Base.metadata
from app.models.creative_prompt import CreativePrompt  # noqa: F401
from app.models.product import Product  # noqa: F401 - registers with Base.metadata
from app.models.product_prompt import ProductPrompt  # noqa: F401
from app.models.batch_job import BatchJob  # noqa: F401
from app.models.auto_pipeline_config import AutoPipelineConfig  # noqa: F401

logging.basicConfig(level=logging.INFO)


def _migrate():
    """Add new columns to existing tables without a migration framework."""
    new_cols = [
        ("videos", "error", "TEXT"),
        ("segments", "analysis_status", "TEXT"),
        ("segments", "prompt", "TEXT"),
        ("segments", "strategy", "TEXT"),
        ("segments", "shots", "TEXT"),
        # model_configs: new JSON blob column
        ("model_configs", "config_json", "TEXT"),
        # keep legacy columns so the migration query below can read them
        ("model_configs", "openai_api_key", "TEXT"),
        ("model_configs", "openai_endpoint", "TEXT"),
        ("model_configs", "openai_vision_model", "TEXT"),
        ("model_configs", "openai_text_model", "TEXT"),
        ("model_configs", "anthropic_api_key", "TEXT"),
        ("model_configs", "anthropic_endpoint", "TEXT"),
        ("model_configs", "claude_vision_model", "TEXT"),
        ("model_configs", "claude_text_model", "TEXT"),
        ("model_configs", "doubao_api_key", "TEXT"),
        ("model_configs", "doubao_endpoint", "TEXT"),
        ("model_configs", "doubao_region", "TEXT"),
        ("model_configs", "doubao_vision_model", "TEXT"),
        ("model_configs", "doubao_text_model", "TEXT"),
        ("model_configs", "minimax_api_key", "TEXT"),
        ("model_configs", "minimax_endpoint", "TEXT"),
        ("model_configs", "minimax_vision_model", "TEXT"),
        ("model_configs", "minimax_text_model", "TEXT"),
        ("model_configs", "zhipu_api_key", "TEXT"),
        ("model_configs", "zhipu_endpoint", "TEXT"),
        ("model_configs", "zhipu_vision_model", "TEXT"),
        ("model_configs", "zhipu_text_model", "TEXT"),
        ("model_configs", "deepseek_api_key", "TEXT"),
        ("model_configs", "deepseek_endpoint", "TEXT"),
        ("model_configs", "deepseek_text_model", "TEXT"),
        ("model_configs", "temperature", "FLOAT DEFAULT 0.7"),
        ("model_configs", "max_tokens", "INTEGER DEFAULT 4096"),
        ("model_configs", "created_at", "DATETIME"),
        ("creative_prompts", "video_id", "TEXT"),
        ("model_configs", "image_model", "TEXT DEFAULT 'laozhang-image-2-vip'"),
        ("model_configs", "video_gen_model", "TEXT DEFAULT 'seedance-2.0'"),
    ]
    with engine.connect() as conn:
        for table, col, col_type in new_cols:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                pass  # column already exists

    # Migrate flat columns → config_json for rows that don't have it yet
    _migrate_to_json()


def _migrate_to_json():
    """One-time migration: pack legacy flat columns into config_json blob."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT id, config_json,"
                " openai_api_key, openai_endpoint, openai_vision_model, openai_text_model,"
                " anthropic_api_key, anthropic_endpoint, claude_vision_model, claude_text_model,"
                " doubao_api_key, doubao_endpoint, doubao_vision_model, doubao_text_model,"
                " minimax_api_key, minimax_endpoint, minimax_text_model,"
                " zhipu_api_key, zhipu_endpoint, zhipu_vision_model, zhipu_text_model,"
                " deepseek_api_key, deepseek_endpoint, deepseek_text_model"
                " FROM model_configs"
            )).fetchall()

            for row in rows:
                if row.config_json:
                    continue  # already migrated

                blob = {
                    "openai": {
                        "api_key":      row.openai_api_key or "",
                        "endpoint":     row.openai_endpoint or "https://api.openai.com/v1",
                        "vision_model": row.openai_vision_model or "gpt-4o",
                        "text_model":   row.openai_text_model or "gpt-4o",
                    },
                    "claude": {
                        "api_key":      row.anthropic_api_key or "",
                        "endpoint":     row.anthropic_endpoint or "https://api.anthropic.com",
                        "vision_model": row.claude_vision_model or "claude-3-5-sonnet-20241022",
                        "text_model":   row.claude_text_model or "claude-3-5-sonnet-20241022",
                    },
                    "doubao": {
                        "api_key":      row.doubao_api_key or "",
                        "endpoint":     row.doubao_endpoint or "https://ark.cn-beijing.volces.com/api/v3",
                        "vision_model": row.doubao_vision_model or "doubao-vision-pro-32k",
                        "text_model":   row.doubao_text_model or "doubao-pro-32k",
                    },
                    "minimax": {
                        "api_key":      row.minimax_api_key or "",
                        "endpoint":     row.minimax_endpoint or "https://api.minimax.chat/v1",
                        "vision_model": "",
                        "text_model":   row.minimax_text_model or "MiniMax-Text-01",
                    },
                    "zhipu": {
                        "api_key":      row.zhipu_api_key or "",
                        "endpoint":     row.zhipu_endpoint or "https://open.bigmodel.cn/api/paas/v4",
                        "vision_model": row.zhipu_vision_model or "glm-4v-plus",
                        "text_model":   row.zhipu_text_model or "glm-4-plus",
                    },
                    "deepseek": {
                        "api_key":      row.deepseek_api_key or "",
                        "endpoint":     row.deepseek_endpoint or "https://api.deepseek.com/v1",
                        "vision_model": "",
                        "text_model":   row.deepseek_text_model or "deepseek-chat",
                    },
                }
                conn.execute(
                    text("UPDATE model_configs SET config_json = :j WHERE id = :id"),
                    {"j": json.dumps(blob), "id": row.id},
                )
            conn.commit()
    except Exception as e:
        logging.warning("config_json migration skipped: %s", e)


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
app.include_router(creative_router)
app.include_router(products_router)


@app.get("/health")
def health():
    return {"status": "ok"}
