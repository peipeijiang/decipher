import logging
import os
import re
import tempfile
import uuid
import base64
import json
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
    """创意改写：基于爆款视频的营销策略（内容钩子+情感共鸣点）生成多个创意角度和视频Prompt。"""
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    report = db.query(Report).filter(Report.video_id == video_id).first()
    if not report or not report.strategy:
        raise HTTPException(400, "请先完成视频分析")

    from app.ai_models import get_model
    from app.models.config import ModelConfig
    from app.api.creative import ANGLE_SYSTEM_PROMPT, PROMPT_SYSTEM_PROMPT, _call_text, _parse_json_array

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
        # Extract 内容钩子分析 and 情感共鸣点 from strategy markdown
        strategy_text = report.strategy or ""
        hook_section = _extract_section(strategy_text, "内容钩子分析")
        emotion_section = _extract_section(strategy_text, "情感共鸣点")

        # Build context that includes the video analysis insights
        video_context = f"""参考爆款视频分析结果（请基于以下洞察生成创意角度）：

【内容钩子分析】
{hook_section or '（未提取到）'}

【情感共鸣点】
{emotion_section or '（未提取到）'}

【原视频逆向提示词参考】
{report.prompt or '（无）'}
"""
        product_part = description.strip() if description.strip() else "（用户未填写产品描述，请根据图片推断）"
        user_msg = f"产品描述：{product_part}\n\n{video_context}"

        # Step 1: Generate creative angles
        angles_raw = _call_text(analysis_model, cfg, ANGLE_SYSTEM_PROMPT, user_msg, tmp_path)
        import re as _re
        angles = _parse_json_array(angles_raw)
        if not angles:
            raise ValueError(f"No JSON array in angles response: {angles_raw[:200]}")

        # Step 2: Generate video prompt per angle
        results = []
        for angle in angles:
            angle_msg = f"产品描述：{product_part}\n\n创意角度：\n标题：{angle.get('title','')}\nHook（视觉）：{angle.get('hook_visual','')}\nHook（文案）：{angle.get('hook_copy','')}\nConcept：{angle.get('concept','')}\n\n参考爆款视频风格：\n{report.prompt or ''}"
            try:
                prompt_text = _call_text(analysis_model, cfg, PROMPT_SYSTEM_PROMPT, angle_msg, tmp_path)
            except Exception as e:
                prompt_text = ""
                logger.warning("Prompt gen failed for angle %s: %s", angle.get("index"), e)
            results.append({"angle": angle, "prompt": prompt_text.strip()})

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
