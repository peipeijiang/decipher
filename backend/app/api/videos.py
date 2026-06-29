import logging
import os
import re
import tempfile
import uuid
import base64
import json
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
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


@router.post("/upload", response_model=VideoOut)
async def upload_video(file: UploadFile = File(...), db: Session = Depends(get_db)):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported format: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

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
        progress = {"upload": 100, "parse": 100, "strategy": 100, "prompt": 100, "error": None}
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


@router.post("/{video_id}/analyze")
def start_analysis(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    import threading
    threading.Thread(target=run_analysis, args=(video_id,), daemon=True).start()
    return {"status": "started"}


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
