"""Background analysis task — runs in a daemon thread after upload."""
import logging
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.video import Video
from app.models.report import Report
from app.services.video_processor import extract_frames, extract_audio, get_duration

logger = logging.getLogger(__name__)


def run_analysis(video_id: str):
    db: Session = SessionLocal()
    try:
        video = db.get(Video, video_id)
        if not video:
            return

        video.status = "processing"
        db.commit()

        # Step 1: Get duration
        duration = get_duration(video.filepath)
        video.duration = duration
        db.commit()

        # Step 2: Extract frames
        frames = extract_frames(video.filepath, video_id, num_frames=6)

        # Step 3: Extract audio
        audio_path = extract_audio(video.filepath, video_id)

        # Step 4: Whisper transcription (lazy import — heavy)
        script = ""
        if audio_path:
            from app.services.whisper import transcribe
            script = transcribe(audio_path)

        # Step 5: AI analysis (placeholder — filled in Phase 3)
        report = db.query(Report).filter(Report.video_id == video_id).first()
        if report:
            report.script = script
            report.strategy = "# 分析中...\n\n请稍候，AI 正在分析视频内容。"
            report.shots = "[]"
            report.prompt = ""

        video.status = "completed"
        db.commit()

    except Exception as e:
        logger.exception("Analysis failed for video %s: %s", video_id, e)
        try:
            video = db.get(Video, video_id)
            if video:
                video.status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
