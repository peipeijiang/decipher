"""Standalone video generation API routes."""
import shutil
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.video_generation import VideoGeneration
from app.tasks.video_gen_task import run_video_generation

router = APIRouter(prefix="/api/video-gen", tags=["video-gen"])

REF_UPLOAD_DIR = Path("video_gen_refs")


@router.post("/create")
def create_video_gen(body: dict, db: Session = Depends(get_db)):
    gen = VideoGeneration(
        id=str(uuid.uuid4()),
        prompt=body["prompt"],
        reference_image=body.get("reference_image"),
        model=body.get("model", "seedance-2.0"),
        aspect_ratio=body.get("aspect_ratio", "9:16"),
        duration=body.get("duration", 5),
        status="pending",
    )
    db.add(gen)
    db.commit()
    db.refresh(gen)
    threading.Thread(target=run_video_generation, args=(gen.id,), daemon=True).start()
    return _serialize(gen)


@router.get("")
def list_video_gens(
    model: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    q = db.query(VideoGeneration)
    if model:
        q = q.filter(VideoGeneration.model == model)
    if status:
        q = q.filter(VideoGeneration.status == status)
    q = q.order_by(VideoGeneration.created_at.desc())
    total = q.count()
    items = q.offset(offset).limit(limit).all()
    return {"items": [_serialize(i) for i in items], "total": total}


@router.get("/{gen_id}")
def get_video_gen(gen_id: str, db: Session = Depends(get_db)):
    gen = db.get(VideoGeneration, gen_id)
    if not gen:
        raise HTTPException(404, "Not found")
    return _serialize(gen)


@router.post("/{gen_id}/retry")
def retry_video_gen(gen_id: str, db: Session = Depends(get_db)):
    gen = db.get(VideoGeneration, gen_id)
    if not gen:
        raise HTTPException(404, "Not found")
    gen.status = "pending"
    gen.error_message = None
    gen.video_url = None
    gen.video_path = None
    gen.completed_at = None
    db.commit()
    db.refresh(gen)
    threading.Thread(target=run_video_generation, args=(gen.id,), daemon=True).start()
    return _serialize(gen)


@router.delete("/{gen_id}")
def delete_video_gen(gen_id: str, db: Session = Depends(get_db)):
    gen = db.get(VideoGeneration, gen_id)
    if not gen:
        raise HTTPException(404, "Not found")
    # Clean up files
    if gen.video_path and Path(gen.video_path).exists():
        Path(gen.video_path).unlink(missing_ok=True)
    if gen.reference_image and Path(gen.reference_image).exists():
        Path(gen.reference_image).unlink(missing_ok=True)
    db.delete(gen)
    db.commit()
    return {"ok": True}


@router.post("/upload-ref")
def upload_reference(file: UploadFile = File(...)):
    REF_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix or ".png"
    filename = f"{uuid.uuid4()}{ext}"
    save_path = REF_UPLOAD_DIR / filename
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"path": str(save_path), "filename": filename}


@router.get("/ref-image/{path:path}")
def get_ref_image(path: str):
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(404, "Reference image not found")
    return FileResponse(str(file_path))


@router.get("/{gen_id}/video")
def get_video_file(gen_id: str, db: Session = Depends(get_db)):
    """Serve local video file (CDN URLs expire after 24h)."""
    gen = db.get(VideoGeneration, gen_id)
    if not gen:
        raise HTTPException(404, "Not found")
    if not gen.video_path or not Path(gen.video_path).exists():
        raise HTTPException(404, "Video file not found")
    return FileResponse(str(gen.video_path), media_type="video/mp4")


def _serialize(gen: VideoGeneration) -> dict:
    return {
        "id": gen.id,
        "prompt": gen.prompt,
        "reference_image": gen.reference_image,
        "model": gen.model,
        "aspect_ratio": gen.aspect_ratio,
        "duration": gen.duration,
        "status": gen.status,
        "video_url": gen.video_url,
        "video_path": gen.video_path,
        "error_message": gen.error_message,
        "created_at": gen.created_at.isoformat() if gen.created_at else None,
        "completed_at": gen.completed_at.isoformat() if gen.completed_at else None,
    }
