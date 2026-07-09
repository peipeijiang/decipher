import logging
import os
import re
import tempfile
import uuid
import base64
import hashlib
import json
import threading
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models.video import Video
from app.models.report import Report
from app.schemas.video import VideoOut
from app.schemas.report import ReportOut
from app.config import settings
from app.tasks.analysis import run_analysis, get_analysis_progress

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/videos", tags=["videos"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".webm"}
MAX_SIZE = settings.max_file_size_mb * 1024 * 1024
_upload_lock = threading.Lock()


@router.post("/upload", response_model=VideoOut)
async def upload_video(response: Response, file: UploadFile = File(...), db: Session = Depends(get_db)):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(413, f"File too large. Max {settings.max_file_size_mb}MB")

    content_hash = hashlib.sha256(content).digest()
    with _upload_lock:
        candidates = (
            db.query(Video)
            .filter(Video.filesize == len(content))
            .order_by(Video.created_at.asc())
            .all()
        )
        for candidate in candidates:
            candidate_path = Path(candidate.filepath)
            if not candidate_path.is_file():
                continue
            if hashlib.sha256(candidate_path.read_bytes()).digest() == content_hash:
                response.headers["X-Video-Duplicate"] = "true"
                response.headers["X-Existing-Video-Id"] = candidate.id
                return candidate

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

        report = Report(video_id=video_id)
        db.add(report)
        db.commit()

    return video


@router.get("/{video_id}")
def get_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    report = db.query(Report).filter(Report.video_id == video_id).first()
    progress = get_analysis_progress(video_id)
    if video.status == "completed":
        progress = {"upload": 100, "parse": 100, "strategy": 100, "prompt": 100, "creative": 100, "error": None}
    elif video.status == "failed":
        progress = {**progress, "error": video.error}

    report_out = None
    if report and report.strategy:
        # Build frame URLs
        frames_dir = Path(settings.processed_dir) / video_id / "frames"
        frame_urls = []
        if frames_dir.exists():
            for f in sorted(frames_dir.glob("frame_*.jpg")):
                idx = int(f.stem.split("_")[1])
                frame_urls.append(f"/api/videos/{video_id}/frames/{idx}")
        report_data = report.__dict__.copy()
        report_data["frame_urls"] = frame_urls if frame_urls else None
        from app.schemas.report import ReportOut
        report_out = ReportOut.model_validate(report_data)

    return {
        "video": VideoOut.model_validate(video),
        "progress": progress,
        "report": report_out,
    }


import threading as _threading
import queue as _queue

_video_analysis_queue: _queue.Queue[str] = _queue.Queue()
_video_analysis_worker_started = False
_video_analysis_lock = _threading.Lock()
_queued_video_ids: set[str] = set()
_active_video_id: str | None = None


def _ensure_video_analysis_worker_started() -> None:
    global _video_analysis_worker_started
    with _video_analysis_lock:
        if _video_analysis_worker_started:
            return
        _video_analysis_worker_started = True
        _threading.Thread(target=_video_analysis_worker, daemon=True).start()


def enqueue_video_analysis(video_id: str) -> bool:
    """Queue one video analysis task.

    Returns True when the task was newly queued. A single worker consumes this
    queue, so bulk uploads/recovery cannot exhaust local model/API resources.
    """
    global _active_video_id
    _ensure_video_analysis_worker_started()
    with _video_analysis_lock:
        if video_id == _active_video_id or video_id in _queued_video_ids:
            return False
        _queued_video_ids.add(video_id)
        _video_analysis_queue.put(video_id)
        return True


def get_video_analysis_queue_snapshot() -> dict:
    with _video_analysis_lock:
        return {
            "active_video_id": _active_video_id,
            "queued_count": len(_queued_video_ids),
            "queued_video_ids": list(_queued_video_ids),
            "worker_started": _video_analysis_worker_started,
        }

def _video_analysis_worker():
    global _active_video_id
    while True:
        video_id = _video_analysis_queue.get()
        try:
            with _video_analysis_lock:
                _queued_video_ids.discard(video_id)
                _active_video_id = video_id
            run_analysis(video_id)
        except Exception:
            logger.exception("Queued video analysis failed unexpectedly: %s", video_id)
        finally:
            with _video_analysis_lock:
                if _active_video_id == video_id:
                    _active_video_id = None
            _video_analysis_queue.task_done()


def resume_unfinished_video_analyses() -> dict:
    """Recover unfinished viral-replica analyses after server start/reload."""
    db = SessionLocal()
    try:
        with _video_analysis_lock:
            active_video_id = _active_video_id
        unfinished = (
            db.query(Video)
            .filter(Video.status.in_(["pending", "processing"]))
            .order_by(Video.created_at.asc())
            .all()
        )
        queued = 0
        for video in unfinished:
            if video.id == active_video_id:
                continue
            # A previous process may have died after setting processing. Treat it
            # as waiting until the single worker actually picks it up.
            video.status = "pending"
            video.error = None
        db.commit()
        for video in unfinished:
            if video.id == active_video_id:
                continue
            if enqueue_video_analysis(video.id):
                queued += 1
        logger.info("Recovered %d unfinished video analyses (%d queued)", len(unfinished), queued)
        return {"recovered": len(unfinished), "queued": queued}
    finally:
        db.close()

@router.post("/{video_id}/analyze")
def start_analysis(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if video.status != "processing":
        video.status = "pending"
    video.error = None
    db.commit()
    queued = enqueue_video_analysis(video_id)
    return {"status": "queued", "queued": queued}


@router.post("/resume-unfinished")
def resume_unfinished_analyses():
    return resume_unfinished_video_analyses()


@router.get("/analysis-queue/status")
def get_video_analysis_queue_status():
    return get_video_analysis_queue_snapshot()


MEDIA_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
}


@router.get("/{video_id}/stream")
def stream_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if not os.path.exists(video.filepath):
        raise HTTPException(404, "Video file not found")
    ext = Path(video.filepath).suffix.lower()
    media_type = MEDIA_TYPES.get(ext, "video/mp4")
    return FileResponse(video.filepath, media_type=media_type)


@router.get("/{video_id}/frames/{frame_index}")
def get_frame(video_id: str, frame_index: int, db: Session = Depends(get_db)):
    """Serve a video frame image. frame_index is 1-based."""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    frames_dir = Path(settings.processed_dir) / video_id / "frames"
    frame_path = frames_dir / f"frame_{frame_index:02d}.jpg"
    if not frame_path.exists():
        raise HTTPException(404, f"Frame {frame_index} not found")
    return FileResponse(str(frame_path), media_type="image/jpeg")


@router.post("/{video_id}/adapt")
async def adapt_video(video_id: str, file: UploadFile = File(None), description: str = Form(""), db: Session = Depends(get_db)):
    """创意改写：基于爆款视频的完整结构（分镜+策略+节奏）生成可复刻的创意角度和视频Prompt。"""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    report = db.query(Report).filter(Report.video_id == video_id).first()
    if not report or not report.strategy:
        raise HTTPException(400, "请先完成视频分析")

    from app.ai_models import get_model
    from app.models.config import ModelConfig
    from app.api.creative import PROMPT_SYSTEM_PROMPT, _call_text, _parse_json_array

    cfg = db.query(ModelConfig).first() or ModelConfig()
    analysis_model = get_model(cfg.analysis_model, cfg)

    # Save optional product image
    tmp_path = None
    if file and file.filename:
        suffix = Path(file.filename).suffix.lower() or ".jpg"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

    try:
        # Extract key analysis data (keep concise to avoid model timeout)
        strategy_text = report.strategy or ""
        hook_section = _extract_section(strategy_text, "内容钩子分析")[:300]
        emotion_section = _extract_section(strategy_text, "情感共鸣点")[:300]
        replication_section = _extract_section(strategy_text, "复制建议")[:400]

        # Parse shots data — compact format
        shots_text = ""
        if report.shots:
            import json as json_mod
            try:
                shots_data = json_mod.loads(report.shots) if isinstance(report.shots, str) else report.shots
                shots_lines = []
                for shot in shots_data:
                    parts = [f"镜头{shot.get('index', '?')}"]
                    if shot.get('timestamp'):
                        parts.append(f"[{shot['timestamp']}]")
                    if shot.get('description'):
                        parts.append(shot['description'][:80])
                    if shot.get('camera_angle'):
                        parts.append(f"({shot['camera_angle']})")
                    if shot.get('dialogue'):
                        parts.append(f"\"{shot['dialogue'][:50]}\"")
                    shots_lines.append(" ".join(parts))
                shots_text = "\n".join(shots_lines)
            except Exception:
                shots_text = str(report.shots)[:1000]

        # Build concise video context
        video_context = f"""爆款视频分析摘要：

【分镜结构】
{shots_text or '（无）'}

【内容钩子】
{hook_section or '（无）'}

【情感共鸣】
{emotion_section or '（无）'}

【复制建议】
{replication_section or '（无）'}

【视觉风格参考】
{(report.prompt or '')[:500]}
"""

        product_part = description.strip() if description.strip() else "（用户未填写产品描述，请根据图片推断）"
        user_msg = f"产品描述：{product_part}\n\n{video_context}"

        # Step 1: Generate creative angles with structure-aware prompt
        # Load agent prompt from DB (replica_creative_rewrite), fallback to hardcoded
        adapt_angle_prompt = None
        try:
            from app.models.agent_prompt import AgentPrompt
            agent = db.query(AgentPrompt).filter(
                AgentPrompt.key == 'replica_creative_rewrite', AgentPrompt.is_active == True
            ).first()
            if agent:
                sp = agent.system_prompt
                ut = agent.user_prompt_template or ""
                adapt_angle_prompt = sp
                # If agent prompt has {{n}}, replace with the number of angles to generate
                adapt_angle_prompt = adapt_angle_prompt.replace("{{n}}", "4")
                logger.info("Using agent_prompt 'replica_creative_rewrite' (len=%d)", len(adapt_angle_prompt))
        except Exception as e:
            logger.warning("Failed to load creative agent prompt: %s", e)

        if not adapt_angle_prompt:
            adapt_angle_prompt = """你是TikTok爆款视频复刻专家。基于爆款视频的分镜结构，为用户产品生成4个可复刻的创意角度。

核心原则：保留爆款骨架（节奏、镜头模式、情绪曲线），替换产品内容。

输出JSON数组，每个角度包含：
[
  {
    "index": 1,
    "title": "角度标题",
    "structure_reference": "复刻了原视频的哪个结构特点",
    "hook_visual": "前3秒视觉钩子",
    "hook_copy": "前3秒文案",
    "shot_sequence": "镜头序列（景别→景别→...）",
    "concept": "拍摄思路",
    "emotion_curve": "情绪曲线（如：好奇→惊喜→满足→行动）",
    "why": "为什么适合该产品"
  }
]

4个角度分别覆盖：完全复刻、变体节奏、反转结构、混合创新。只输出JSON。"""

        angles_raw = _call_text(analysis_model, cfg, adapt_angle_prompt, user_msg, tmp_path)
        angles = _parse_json_array(angles_raw)
        if not angles:
            raise ValueError(f"No JSON array in angles response: {angles_raw[:200]}")

        # Step 2: Generate video prompt per angle
        # Load per-angle prompt from DB, fallback to hardcoded
        adapt_prompt_system = None
        try:
            from app.models.agent_prompt import AgentPrompt
            agent = db.query(AgentPrompt).filter(
                AgentPrompt.key == 'replica_prompt_gen', AgentPrompt.is_active == True
            ).first()
            if agent:
                adapt_prompt_system = agent.system_prompt
                # Append instruction to generate a single-angle prompt
                adapt_prompt_system += "\n\nGenerate a SINGLE video prompt for ONLY the angle described below. Output the prompt directly. English only."
                logger.info("Using agent_prompt 'replica_prompt_gen' for per-angle video prompt")
        except Exception as e:
            logger.warning("Failed to load prompt gen agent: %s", e)

        if not adapt_prompt_system:
            adapt_prompt_system = """You are a TikTok video director. Generate a shooting prompt that replicates the original viral video's rhythm with the new product.

Output format (English only, no other text):

[Title] <catchy title>
[Equipment] <camera setup>
[Video Style] <TikTok style>
[Video Music] <music style>
[Video Effects] <editing effects>
[Hook] <hook that stops the scroll>
[Video Content] <shot-by-shot with timestamps based on content rhythm>
[Product Consistency] <product appearance for AI consistency>

Rules: mirror the original video's rhythm, specify camera angles per timestamp, keep concise."""

        results = []
        for angle in angles:
            angle_msg = f"""Product: {product_part}

Angle: {angle.get('title','')}
Structure: {angle.get('structure_reference','')}
Shots: {angle.get('shot_sequence','')}
Emotion: {angle.get('emotion_curve','')}

Original video shots:
{shots_text}"""
            try:
                prompt_text = _call_text(analysis_model, cfg, adapt_prompt_system, angle_msg, tmp_path)
            except Exception as e:
                prompt_text = ""
                logger.warning("Prompt gen failed for angle %s: %s", angle.get("index"), e)
            results.append({"angle": angle, "prompt": prompt_text.strip()})

        # Save to creative history
        import json as json_mod
        from app.models.creative_prompt import CreativePrompt
        record = CreativePrompt(
            id=str(uuid.uuid4()),
            description=description.strip() or "爆款复刻改写",
            results=json_mod.dumps(results, ensure_ascii=False),
            video_id=video_id,
            created_at=datetime.utcnow(),
        )
        db.add(record)
        db.commit()

        return {"results": results}

    except Exception as e:
        logger.error("adapt_video failed: %s", e)
        raise HTTPException(500, f"创意改写失败: {e}")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


def _extract_section(markdown: str, section_name: str) -> str:
    """Extract content under a ## section heading from markdown."""
    import re
    pattern = rf'##\s*{re.escape(section_name)}\s*\n([\s\S]*?)(?=\n##|\Z)'
    m = re.search(pattern, markdown)
    return m.group(1).strip() if m else ""


# ── Auto creative generation ──────────────────────────────────────────────────

@router.post("/{video_id}/auto-creatives")
def auto_generate_creatives(video_id: str, db: Session = Depends(get_db)):
    """Auto-generate 10 creative prompt variants from completed video analysis."""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    report = db.query(Report).filter(Report.video_id == video_id).first()
    if not report or not report.strategy:
        raise HTTPException(400, "请先完成视频分析")

    from app.ai_models import get_model
    from app.models.config import ModelConfig
    from app.models.creative_prompt import CreativePrompt
    from app.api.creative import _parse_json_array

    cfg = db.query(ModelConfig).first() or ModelConfig()
    analysis_model = get_model(cfg.analysis_model, cfg)

    # Extract core creative from strategy + prompt
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
    prompt_text = report.prompt or ""
    reverse_prompt_short = prompt_text[:1500] if prompt_text else ""

    # Generate 10 creative prompt variants
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

    raw = analysis_model.analyze_text(variants_prompt, task="direct")
    variants = _parse_json_array(raw)

    if not variants:
        raise HTTPException(500, "Failed to generate creative variants")

    # Save to DB
    import uuid as _uuid
    from datetime import datetime as _dt
    record = CreativePrompt(
        id=str(_uuid.uuid4()),
        description=core_creative,
        results=json.dumps(variants, ensure_ascii=False),
        video_id=video_id,
        created_at=_dt.utcnow(),
    )
    db.add(record)
    db.commit()

    return {
        "id": record.id,
        "core_creative": core_creative,
        "variants": variants,
    }
