import os
import shutil
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.video import Video
from app.models.report import Report
from app.schemas.video import VideoOut
from app.config import settings
from app.tasks.analysis import run_analysis

router = APIRouter(prefix="/api/videos", tags=["videos"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm"}
MAX_SIZE = settings.max_file_size_mb * 1024 * 1024


@router.post("/upload", response_model=VideoOut)
async def upload_video(file: UploadFile = File(...), db: Session = Depends(get_db)):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Read and size-check
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(413, f"File too large. Max {settings.max_file_size_mb}MB")

    video_id = str(uuid.uuid4())
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(exist_ok=True)
    filepath = upload_dir / f"{video_id}{ext}"
    filepath.write_bytes(content)

    video = Video(
        id=video_id,
        filename=file.filename,
        filepath=str(filepath),
        filesize=len(content),
        status="pending",
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    # Create empty report
    report = Report(video_id=video_id)
    db.add(report)
    db.commit()

    # Kick off background analysis
    import threading
    threading.Thread(target=run_analysis, args=(video_id,), daemon=True).start()

    return video


@router.get("/{video_id}", response_model=VideoOut)
def get_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    return video


@router.get("/{video_id}/stream")
def stream_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if not os.path.exists(video.filepath):
        raise HTTPException(404, "Video file not found")
    return FileResponse(video.filepath, media_type="video/mp4")
