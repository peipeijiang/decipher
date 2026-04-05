"""Background analysis task — runs in a daemon thread after upload."""
import logging
from pathlib import Path
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.video import Video
from app.models.report import Report
from app.services.video_processor import extract_frames, extract_audio, get_video_info

logger = logging.getLogger(__name__)


def run_analysis(video_id: str):
    db: Session = SessionLocal()
    try:
        video = db.get(Video, video_id)
        if not video:
            return

        video.status = "processing"
        db.commit()

        # Step 1: Get video metadata
        processed_base = Path(settings.processed_dir) / video_id
        info = get_video_info(video.filepath)
        video.duration = info["duration"]
        db.commit()

        # Step 2: Extract frames
        frames = extract_frames(
            video.filepath,
            output_dir=processed_base / "frames",
            num_frames=6,
        )

        # Step 3: Extract audio (video may have no audio track)
        audio_path: str | None = None
        try:
            audio_path = extract_audio(
                video.filepath,
                output_path=processed_base / "audio.mp3",
            )
        except RuntimeError as exc:
            logger.info("Audio extraction skipped for %s: %s", video_id, exc)

        # Step 4: Whisper transcription (lazy import — heavy)
        script = ""
        if audio_path:
            from app.services.whisper import transcribe
            script = transcribe(audio_path)

        # Step 5: AI analysis
        from app.ai_models import get_model
        from app.services.ai_analyzer import run_ai_analysis

        vision_model = get_model(settings.default_vision_model)
        analysis_model = get_model(settings.default_analysis_model)
        ai_result = run_ai_analysis(
            frames=[str(f) for f in frames],
            script=script,
            vision_model=vision_model,
            analysis_model=analysis_model,
        )

        report = db.query(Report).filter(Report.video_id == video_id).first()
        if report:
            report.script = script
            report.strategy = ai_result["strategy"]
            report.shots = ai_result["shots"]
            report.prompt = ai_result["prompt"]

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
