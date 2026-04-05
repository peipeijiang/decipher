from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.video import Video
from app.models.report import Report
from app.models.config import ModelConfig
from app.schemas.report import ReportOut, ModelConfigOut, ModelConfigUpdate, SUPPORTED_MODELS
from app.schemas.video import VideoOut

router = APIRouter(prefix="/api/reports", tags=["reports"])
config_router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("", response_model=list[dict])
def list_reports(db: Session = Depends(get_db)):
    videos = db.query(Video).order_by(Video.created_at.desc()).all()
    result = []
    for v in videos:
        result.append({
            "video_id": v.id,
            "filename": v.filename,
            "status": v.status,
            "created_at": v.created_at.isoformat(),
            "duration": v.duration,
            "platform": v.platform,
        })
    return result


@router.get("/{video_id}", response_model=ReportOut)
def get_report(video_id: str, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.video_id == video_id).first()
    if not report:
        raise HTTPException(404, "Report not found")
    return report


@router.patch("/{video_id}")
def update_report(video_id: str, body: dict, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if "notes" in body:
        video.notes = body["notes"]
    if "platform" in body:
        video.platform = body["platform"]
    if "likes" in body:
        video.likes = body["likes"]
    db.commit()
    return {"ok": True}


@router.delete("/{video_id}")
def delete_report(video_id: str, db: Session = Depends(get_db)):
    import os
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    report = db.query(Report).filter(Report.video_id == video_id).first()
    if report:
        db.delete(report)
    # Remove file
    if os.path.exists(video.filepath):
        os.remove(video.filepath)
    db.delete(video)
    db.commit()
    return {"ok": True}


# ── Model config ────────────────────────────────────────────────────────────

@config_router.get("/models")
def list_models():
    return {"models": SUPPORTED_MODELS}


@config_router.get("/models/current", response_model=ModelConfigOut)
def get_current_config(db: Session = Depends(get_db)):
    cfg = db.query(ModelConfig).first()
    if not cfg:
        cfg = ModelConfig()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    # Mask API keys - return only configured status
    out = ModelConfigOut(
        id=cfg.id,
        vision_model=cfg.vision_model,
        analysis_model=cfg.analysis_model,
        openai_configured=bool(cfg.openai_api_key),
        claude_configured=bool(cfg.anthropic_api_key),
        doubao_configured=bool(cfg.doubao_api_key),
        minimax_configured=bool(cfg.minimax_api_key),
        zhipu_configured=bool(cfg.zhipu_api_key),
        deepseek_configured=bool(cfg.deepseek_api_key),
        openai_endpoint=cfg.openai_endpoint,
        claude_endpoint=cfg.anthropic_endpoint,
        doubao_endpoint=cfg.doubao_endpoint,
        minimax_endpoint=cfg.minimax_endpoint,
        zhipu_endpoint=cfg.zhipu_endpoint,
        deepseek_endpoint=cfg.deepseek_endpoint,
        openai_vision_model=cfg.openai_vision_model,
        openai_text_model=cfg.openai_text_model,
        claude_vision_model=cfg.claude_vision_model,
        claude_text_model=cfg.claude_text_model,
        doubao_vision_model=cfg.doubao_vision_model,
        doubao_text_model=cfg.doubao_text_model,
        minimax_vision_model=cfg.minimax_vision_model,
        minimax_text_model=cfg.minimax_text_model,
        zhipu_vision_model=cfg.zhipu_vision_model,
        zhipu_text_model=cfg.zhipu_text_model,
        deepseek_text_model=cfg.deepseek_text_model,
        temperature=cfg.temperature or 0.7,
        max_tokens=cfg.max_tokens or 4096,
        updated_at=cfg.updated_at,
    )
    return out


@config_router.patch("/models", response_model=ModelConfigOut)
def update_config(body: ModelConfigUpdate, db: Session = Depends(get_db)):
    cfg = db.query(ModelConfig).first()
    if not cfg:
        cfg = ModelConfig()
        db.add(cfg)
    if body.vision_model:
        if body.vision_model not in SUPPORTED_MODELS:
            raise HTTPException(400, f"Unsupported model: {body.vision_model}")
        cfg.vision_model = body.vision_model
    if body.analysis_model:
        if body.analysis_model not in SUPPORTED_MODELS:
            raise HTTPException(400, f"Unsupported model: {body.analysis_model}")
        cfg.analysis_model = body.analysis_model
    # API Keys - only update if provided
    if body.openai_api_key:
        cfg.openai_api_key = body.openai_api_key
    if body.claude_api_key:
        cfg.anthropic_api_key = body.claude_api_key
    if body.doubao_api_key:
        cfg.doubao_api_key = body.doubao_api_key
    if body.minimax_api_key:
        cfg.minimax_api_key = body.minimax_api_key
    if body.zhipu_api_key:
        cfg.zhipu_api_key = body.zhipu_api_key
    if body.deepseek_api_key:
        cfg.deepseek_api_key = body.deepseek_api_key
    # Endpoints
    if body.openai_endpoint is not None:
        cfg.openai_endpoint = body.openai_endpoint
    if body.claude_endpoint is not None:
        cfg.anthropic_endpoint = body.claude_endpoint
    if body.doubao_endpoint is not None:
        cfg.doubao_endpoint = body.doubao_endpoint
    if body.minimax_endpoint is not None:
        cfg.minimax_endpoint = body.minimax_endpoint
    if body.zhipu_endpoint is not None:
        cfg.zhipu_endpoint = body.zhipu_endpoint
    if body.deepseek_endpoint is not None:
        cfg.deepseek_endpoint = body.deepseek_endpoint
    # Model names
    if body.openai_vision_model is not None:
        cfg.openai_vision_model = body.openai_vision_model
    if body.openai_text_model is not None:
        cfg.openai_text_model = body.openai_text_model
    if body.claude_vision_model is not None:
        cfg.claude_vision_model = body.claude_vision_model
    if body.claude_text_model is not None:
        cfg.claude_text_model = body.claude_text_model
    if body.doubao_vision_model is not None:
        cfg.doubao_vision_model = body.doubao_vision_model
    if body.doubao_text_model is not None:
        cfg.doubao_text_model = body.doubao_text_model
    if body.minimax_vision_model is not None:
        cfg.minimax_vision_model = body.minimax_vision_model
    if body.minimax_text_model is not None:
        cfg.minimax_text_model = body.minimax_text_model
    if body.zhipu_vision_model is not None:
        cfg.zhipu_vision_model = body.zhipu_vision_model
    if body.zhipu_text_model is not None:
        cfg.zhipu_text_model = body.zhipu_text_model
    if body.deepseek_text_model is not None:
        cfg.deepseek_text_model = body.deepseek_text_model
    # Global params
    if body.temperature is not None:
        cfg.temperature = body.temperature
    if body.max_tokens is not None:
        cfg.max_tokens = body.max_tokens
    cfg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cfg)
    return get_current_config(db)
