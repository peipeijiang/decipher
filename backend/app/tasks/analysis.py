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
from app.services.video_processor import extract_frames, extract_audio, extract_segment, get_video_info, frames_for_duration, detect_scene_changes

logger = logging.getLogger(__name__)

# In-memory progress store: video_id → {upload, parse, strategy, prompt}
_progress: dict[str, dict] = {}


def get_analysis_progress(video_id: str) -> dict:
    return _progress.get(video_id, {"upload": 0, "parse": 0, "strategy": 0, "prompt": 0, "creative": 0, "error": None})


def _set_progress(video_id: str, error: str | None = None, **kwargs: int) -> None:
    if video_id not in _progress:
        _progress[video_id] = {"upload": 0, "parse": 0, "strategy": 0, "prompt": 0, "creative": 0, "error": None}
    _progress[video_id].update(kwargs)
    if error is not None:
        _progress[video_id]["error"] = error


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

        # Step 2: Smart frame extraction — detect scene density first
        duration = info.get("duration") or 30
        scene_density: float | None = None
        try:
            scene_ts = detect_scene_changes(video.filepath)
            if scene_ts and duration > 0:
                scene_density = len(scene_ts) / duration
        except Exception as e:
            logger.warning("Scene detection skipped: %s", e)
        num_frames = frames_for_duration(duration, scene_density=scene_density)
        logger.info(
            "Frame extraction: duration=%.1fs, scene_density=%s, target_frames=%d",
            duration, f"{scene_density:.3f}" if scene_density else "none", num_frames
        )
        frames = extract_frames(
            video.filepath,
            output_dir=processed_base / "frames",
            num_frames=num_frames,
            use_scene_detection=True,
        )
        # Save frame count to video record
        video.frame_count = num_frames
        db.commit()
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
        whisper_segments = []
        if audio_path:
            from app.services.whisper import whisper_transcribe
            result = whisper_transcribe(audio_path)
            script = result.get("text", "")
            whisper_segments = result.get("segments", [])
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
            whisper_segments=whisper_segments,
            vision_model=vision_model,
            analysis_model=analysis_model,
            db=db,
            duration=duration,
        )
        _set_progress(video_id, strategy=100, prompt=100)

        report = db.query(Report).filter(Report.video_id == video_id).first()
        if report:
            import json
            report.script = script
            report.script_segments = json.dumps(
                [{"start": s.get("start", 0), "end": s.get("end", 0), "text": s.get("text", "").strip()}
                 for s in whisper_segments],
                ensure_ascii=False,
            ) if whisper_segments else None
            report.strategy = ai_result["strategy"]
            report.shots = ai_result["shots"]
            report.prompt = ai_result["prompt"]

        db.commit()

        try:
            logger.info("Auto-generating creative variants for video %s", video_id)
            _auto_gen_creatives(video_id, db)
            _set_progress(video_id, creative=100)
        except Exception as creative_error:
            logger.exception(
                "Creative auto-generation failed for video %s: %s",
                video_id, creative_error
            )

        try:
            from app.tasks.storyboard_pipeline import ensure_storyboard_for_video
            ensure_storyboard_for_video(video_id)
        except Exception as storyboard_error:
            logger.exception(
                "Storyboard generation failed after video analysis %s: %s",
                video_id, storyboard_error
            )
        video = db.get(Video, video_id)
        if video:
            video.status = "completed"
            db.commit()

    except Exception as e:
        logger.exception("Analysis failed for video %s: %s", video_id, e)
        try:
            video = db.get(Video, video_id)
            if video:
                video.status = "failed"
                video.error = str(e)
                db.commit()
        except Exception:
            pass
        _set_progress(video_id, error=str(e))
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
            use_scene_detection=False,  # segment clips are short, even spacing is fine
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
            db=db,
            duration=0,
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

def _normalize_creative_variants(raw_variants: list) -> list:
    """Convert auto-generated variant JSON into {angle: CreativeAngle, prompt: str} format."""
    normalized = []
    for v in raw_variants:
        if not isinstance(v, dict):
            continue
        # Already in correct format: has "angle" key with dict
        if "angle" in v and isinstance(v["angle"], dict) and "prompt" in v:
            normalized.append(v)
            continue
        # Old format: flat {index, title, prompt, angle: string} → convert
        title = v.get("title", "")
        flat_angle = v.get("angle", "")
        prompt = v.get("prompt", "")
        if not prompt:
            continue
        normalized.append({
            "angle": {
                "title": title or "Variant",
                "hook_visual": "",
                "hook_copy": "",
                "concept": flat_angle if isinstance(flat_angle, str) else "",
                "why": "",
                "emotion_curve": "",
                "structure_reference": "",
                "shot_sequence": "",
            },
            "prompt": prompt,
        })
    return normalized


def _auto_gen_creatives(video_id: str, db: Session):
    """Inline creative auto-generation — avoids circular import with api/videos.py."""
    import json as _json, uuid as _uuid
    from datetime import datetime as _dt
    from app.models.creative_prompt import CreativePrompt
    from app.ai_models import get_model
    from app.models.config import ModelConfig
    from app.models.report import Report

    report = db.query(Report).filter(Report.video_id == video_id).first()
    if not report or not report.strategy:
        return

    cfg = db.query(ModelConfig).first() or ModelConfig()
    analysis_model = get_model(cfg.analysis_model, cfg)

    strategy_text = report.strategy or ""
    prompt_text = report.prompt or ""

    core_creative_prompt = f"""You are an expert at distilling viral TikTok video creativity into reusable formulas.

Given below is a detailed analysis of a viral TikTok video. Extract the CORE CREATIVE FORMULA in 3-5 sentences. Focus on:
- The emotional hook mechanism
- The unique visual rhythm/pattern
- The narrative structure that made it go viral
- What makes it replicable across different products

Video Analysis:
{strategy_text[:2000]}

Reverse Prompt:
{prompt_text[:1000]}

Return ONLY the core creative formula as 3-5 plain English sentences. No markdown, no JSON."""

    try:
        core_creative = analysis_model.analyze_text(core_creative_prompt, task="direct").strip()
    except Exception as e:
        logger.warning("Core creative extraction failed: %s, using fallback", e)
        core_creative = strategy_text[:500]

    # Use reverse prompt as style/tone reference for variant generation
    reverse_prompt_short = prompt_text[:1500] if prompt_text else ""

    variants_prompt = f"""You are a TikTok creative director. Use the CORE CREATIVE FORMULA and REVERSE PROMPT below to generate 10 distinct prompt variants.

CORE CREATIVE FORMULA:
{core_creative}

REFERENCE REVERSE PROMPT (the original video's visual style, camera work, lighting, shot structure):
{reverse_prompt_short}

Generate 10 prompt variants. For each variant, output a JSON object with TWO parts: a detailed "angle" object AND a complete "prompt" string.

The "angle" object must contain:
- title: Short catchy title describing this variant's unique twist
- hook_visual: The first 3-seconds visual hook in 1 sentence
- hook_copy: The first 3-seconds opening line (dialogue or overlay text)
- concept: Detailed shooting concept (2-3 sentences with camera movement, framing, editing)
- why: Why this angle fits and how it adapts the core formula (1-2 sentences)
- emotion_curve: The emotional journey, e.g. "curiosity→delight→trust→action"
- structure_reference: Which part of the core formula this variant emphasizes
- shot_sequence: Lens progression, e.g. "medium→close-up→medium→wide→close-up"

The "prompt" must be a COMPLETE English video generation prompt with sections: STYLE, CAMERA, LIGHTING, ACTIONS, AUDIO. Mirror the reverse prompt's level of detail.

Output a JSON array of 10 objects:
[
  {{
    "angle": {{
      "title": "...",
      "hook_visual": "...",
      "hook_copy": "...",
      "concept": "...",
      "why": "...",
      "emotion_curve": "...",
      "structure_reference": "...",
      "shot_sequence": "..."
    }},
    "prompt": "Complete video generation prompt..."
  }}
]

Return ONLY the JSON array. No markdown, no explanation."""

    from app.api.creative import _parse_json_array
    raw = analysis_model.analyze_text(variants_prompt, task="direct")
    variants = _parse_json_array(raw)

    if not variants:
        logger.warning("Creative variant generation returned empty for video %s", video_id)
        return

    # Normalize: ensure each variant has {angle: {...}, prompt: "..."} format
    variants = _normalize_creative_variants(variants)

    record = CreativePrompt(
        id=str(_uuid.uuid4()),
        description=core_creative,
        results=_json.dumps(variants, ensure_ascii=False),
        video_id=video_id,
        created_at=_dt.utcnow(),
    )
    db.add(record)
    db.commit()
    logger.info("Auto-generated %d creative variants for video %s", len(variants), video_id)
