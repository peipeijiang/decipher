from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.video import Video
from app.models.report import Report, ModelConfig
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
    return cfg


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
    cfg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cfg)
    return cfg
