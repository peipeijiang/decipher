"""Background analysis task — runs in a daemon thread after upload."""
import logging
from pathlib import Path
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.video import Video
from app.models.report import Report
from app.models.segment import Segment
from app.models.config import ModelConfig
from app.services.video_processor import extract_frames, extract_audio, extract_segment, get_video_info, frames_for_duration

logger = logging.getLogger(__name__)

# In-memory progress store: video_id → {upload, parse, strategy, prompt}
_progress: dict[str, dict] = {}


def get_analysis_progress(video_id: str) -> dict:
    return _progress.get(video_id, {"upload": 0, "parse": 0, "strategy": 0, "prompt": 0})


def _set_progress(video_id: str, **kwargs: int) -> None:
    if video_id not in _progress:
        _progress[video_id] = {"upload": 0, "parse": 0, "strategy": 0, "prompt": 0}
    _progress[video_id].update(kwargs)


def run_analysis(video_id: str):
    db: Session = SessionLocal()
    try:
        video = db.get(Video, video_id)
        if not video:
            return

        video.status = "processing"
        db.commit()
        _set_progress(video_id, upload=100, parse=0, strategy=0, prompt=0)

        # Step 1: Get video metadata
        processed_base = Path(settings.processed_dir) / video_id
        info = get_video_info(video.filepath)
        video.duration = info["duration"]
        db.commit()
        _set_progress(video_id, parse=10)

        # Step 2: Extract frames (dynamic count based on duration)
        duration = info.get("duration") or 30
        num_frames = frames_for_duration(duration)
        frames = extract_frames(
            video.filepath,
            output_dir=processed_base / "frames",
            num_frames=num_frames,
        )
        _set_progress(video_id, parse=40)

        # Step 3: Extract audio (video may have no audio track)
        audio_path: str | None = None
        try:
            audio_path = extract_audio(
                video.filepath,
                output_path=processed_base / "audio.mp3",
            )
        except RuntimeError as exc:
            logger.info("Audio extraction skipped for %s: %s", video_id, exc)
        _set_progress(video_id, parse=70)

        # Step 4: Whisper transcription (lazy import — heavy)
        script = ""
        if audio_path:
            from app.services.whisper import transcribe
            script = transcribe(audio_path)
        _set_progress(video_id, parse=100, strategy=0)

        # Step 5: AI analysis
        from app.ai_models import get_model
        from app.services.ai_analyzer import run_ai_analysis

        cfg = db.query(ModelConfig).first() or ModelConfig()
        vision_model = get_model(cfg.vision_model, cfg)
        analysis_model = get_model(cfg.analysis_model, cfg)
        _set_progress(video_id, strategy=30)
        ai_result = run_ai_analysis(
            frames=[str(f) for f in frames],
            script=script,
            vision_model=vision_model,
            analysis_model=analysis_model,
        )
        _set_progress(video_id, strategy=100, prompt=100)

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


def analyze_segment(segment_id: str):
    db: Session = SessionLocal()
    try:
        seg = db.get(Segment, segment_id)
        if not seg:
            return

        video = db.get(Video, seg.video_id)
        if not video:
            return

        seg.analysis_status = "processing"
        db.commit()

        processed_base = Path(settings.processed_dir) / video.id / "segments" / segment_id

        # Step 1: Cut the segment clip
        clip_path = extract_segment(
            video.filepath,
            output_path=processed_base / "clip.mp4",
            start_time=seg.start_time,
            end_time=seg.end_time,
        )

        # Step 2: Extract frames from the clip (dynamic count)
        seg_duration = seg.end_time - seg.start_time
        num_frames = frames_for_duration(seg_duration, is_segment=True)
        frames = extract_frames(
            clip_path,
            output_dir=processed_base / "frames",
            num_frames=num_frames,
        )

        # Step 3: Extract audio + Whisper transcription
        script = ""
        try:
            audio_path = extract_audio(
                clip_path,
                output_path=processed_base / "audio.mp3",
            )
            from app.services.whisper import transcribe
            script = transcribe(audio_path)
        except RuntimeError as exc:
            logger.info("Audio/transcription skipped for segment %s: %s", segment_id, exc)

        # Step 4: AI analysis
        from app.ai_models import get_model
        from app.services.ai_analyzer import run_ai_analysis

        cfg = db.query(ModelConfig).first() or ModelConfig()
        vision_model = get_model(cfg.vision_model, cfg)
        analysis_model = get_model(cfg.analysis_model, cfg)
        ai_result = run_ai_analysis(
            frames=[str(f) for f in frames],
            script=script,
            vision_model=vision_model,
            analysis_model=analysis_model,
        )

        seg.strategy = ai_result["strategy"]
        seg.shots = ai_result["shots"]
        seg.prompt = ai_result["prompt"]
        seg.analysis_status = "completed"
        db.commit()

    except Exception as e:
        logger.exception("Segment analysis failed for %s: %s", segment_id, e)
        try:
            seg = db.get(Segment, segment_id)
            if seg:
                seg.analysis_status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
