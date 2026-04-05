from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.video import Video
from app.models.report import Report
from app.models.config import ModelConfig
from app.config.presets import get_provider_presets, PROVIDER_PRESETS, PROVIDER_ORDER
from app.schemas.report import (
    ReportOut, ModelConfigOut, ModelConfigUpdate,
    ProviderConfigOut, SUPPORTED_MODELS,
)

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
    if os.path.exists(video.filepath):
        os.remove(video.filepath)
    db.delete(video)
    db.commit()
    return {"ok": True}


# ── helpers ──────────────────────────────────────────────────────────────────

def _cfg_to_out(cfg: ModelConfig) -> ModelConfigOut:
    providers = cfg.get_providers()
    providers_out: dict[str, ProviderConfigOut] = {}
    for pid in PROVIDER_ORDER:
        p = providers.get(pid, {})
        preset = PROVIDER_PRESETS[pid]
        providers_out[pid] = ProviderConfigOut(
            configured=bool(p.get("api_key")),
            endpoint=p.get("endpoint") or preset["endpoint"],
            vision_model=p.get("vision_model") or preset.get("vision_model", ""),
            text_model=p.get("text_model") or preset.get("text_model", ""),
        )
    return ModelConfigOut(
        id=cfg.id,
        vision_model=cfg.vision_model,
        analysis_model=cfg.analysis_model,
        providers=providers_out,
        temperature=cfg.temperature or 0.7,
        max_tokens=cfg.max_tokens or 4096,
        updated_at=cfg.updated_at,
    )


def _get_or_create_cfg(db: Session) -> ModelConfig:
    cfg = db.query(ModelConfig).first()
    if not cfg:
        cfg = ModelConfig()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


# ── Model config endpoints ────────────────────────────────────────────────────

@config_router.get("/models")
def list_models():
    return {"models": SUPPORTED_MODELS}


@config_router.get("/models/current", response_model=ModelConfigOut)
def get_current_config(db: Session = Depends(get_db)):
    cfg = _get_or_create_cfg(db)
    return _cfg_to_out(cfg)


@config_router.patch("/models", response_model=ModelConfigOut)
def update_config(body: ModelConfigUpdate, db: Session = Depends(get_db)):
    cfg = _get_or_create_cfg(db)

    if body.vision_model is not None:
        if body.vision_model not in SUPPORTED_MODELS:
            raise HTTPException(400, f"Unsupported model: {body.vision_model}")
        cfg.vision_model = body.vision_model
    if body.analysis_model is not None:
        if body.analysis_model not in SUPPORTED_MODELS:
            raise HTTPException(400, f"Unsupported model: {body.analysis_model}")
        cfg.analysis_model = body.analysis_model
    if body.temperature is not None:
        cfg.temperature = body.temperature
    if body.max_tokens is not None:
        cfg.max_tokens = body.max_tokens

    if body.providers:
        existing = cfg.get_providers()
        for pid, pu in body.providers.items():
            p = existing.setdefault(pid, {})
            # Only overwrite api_key when the caller actually sends one
            if pu.api_key:
                p["api_key"] = pu.api_key
            if pu.endpoint is not None:
                p["endpoint"] = pu.endpoint
            if pu.vision_model is not None:
                p["vision_model"] = pu.vision_model
            if pu.text_model is not None:
                p["text_model"] = pu.text_model
        cfg.set_providers(existing)

    cfg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cfg)
    return _cfg_to_out(cfg)


@config_router.get("/providers")
def list_provider_presets():
    """Return provider presets (no sensitive data) for frontend defaults."""
    return get_provider_presets()
