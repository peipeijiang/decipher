from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.video import Video
from app.models.segment import Segment
from app.schemas.segment import SegmentCreate, SegmentOut

router = APIRouter(tags=["segments"])


@router.post("/api/videos/{video_id}/segments", response_model=SegmentOut)
def create_segment(video_id: str, body: SegmentCreate, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if body.end_time <= body.start_time:
        raise HTTPException(400, "end_time must be greater than start_time")

    seg = Segment(
        video_id=video_id,
        start_time=body.start_time,
        end_time=body.end_time,
        label=body.label or f"片段",
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return seg


@router.get("/api/videos/{video_id}/segments", response_model=list[SegmentOut])
def list_segments(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    return db.query(Segment).filter(Segment.video_id == video_id).order_by(Segment.start_time).all()


@router.get("/api/segments/{segment_id}", response_model=SegmentOut)
def get_segment(segment_id: str, db: Session = Depends(get_db)):
    seg = db.get(Segment, segment_id)
    if not seg:
        raise HTTPException(404, "Segment not found")
    return seg


@router.delete("/api/segments/{segment_id}")
def delete_segment(segment_id: str, db: Session = Depends(get_db)):
    seg = db.get(Segment, segment_id)
    if not seg:
        raise HTTPException(404, "Segment not found")
    db.delete(seg)
    db.commit()
    return {"ok": True}
