from datetime import datetime
import os
import re
import subprocess
import sys
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.video import Video
from app.models.report import Report
from app.models.config import ModelConfig
from app.config.presets import get_provider_presets, PROVIDER_PRESETS, PROVIDER_ORDER
from app.schemas.report import (
    ReportOut, ModelConfigOut, ModelConfigUpdate,
    ProviderConfigOut, SUPPORTED_MODELS,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])
config_router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("", response_model=list[dict])
def list_reports(db: Session = Depends(get_db)):
    videos = db.query(Video).order_by(Video.created_at.desc()).all()
    video_ids = [v.id for v in videos]
    reports = {}
    if video_ids:
        reports = {
            r.video_id: r
            for r in db.query(Report).filter(Report.video_id.in_(video_ids)).all()
        }
    result = []
    for v in videos:
        report = reports.get(v.id)
        source_path = os.path.abspath(v.filepath) if v.filepath else ""
        result.append({
            "video_id": v.id,
            "filename": v.filename,
            "display_title": _build_replica_display_title(v, report),
            "status": v.status,
            "created_at": v.created_at.isoformat(),
            "duration": v.duration,
            "platform": v.platform,
            "source_path": source_path,
            "source_exists": bool(source_path and os.path.exists(source_path)),
        })
    return result


@router.get("/{video_id}", response_model=ReportOut)
def get_report(video_id: str, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.video_id == video_id).first()
    if not report:
        raise HTTPException(404, "Report not found")
    return report


@router.patch("/{video_id}")
def update_report(video_id: str, body: dict, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    if "notes" in body:
        video.notes = body["notes"]
    if "platform" in body:
        video.platform = body["platform"]
    if "likes" in body:
        video.likes = body["likes"]
    db.commit()
    return {"ok": True}


@router.post("/{video_id}/reveal-source")
def reveal_source_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    source_path = os.path.abspath(video.filepath) if video.filepath else ""
    if not source_path or not os.path.exists(source_path):
        raise HTTPException(404, "Source video file not found")

    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", "-R", source_path])
        elif sys.platform.startswith("win"):
            subprocess.Popen(["explorer", "/select,", source_path])
        else:
            subprocess.Popen(["xdg-open", os.path.dirname(source_path)])
    except Exception as exc:
        raise HTTPException(500, f"Failed to reveal source video: {exc}") from exc

    return {"ok": True, "path": source_path}


@router.delete("/{video_id}")
def delete_report(video_id: str, db: Session = Depends(get_db)):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    report = db.query(Report).filter(Report.video_id == video_id).first()
    if report:
        db.delete(report)
    if os.path.exists(video.filepath):
        os.remove(video.filepath)
    db.delete(video)
    db.commit()
    return {"ok": True}


# ── helpers ──────────────────────────────────────────────────────────────────

import re

_TITLE_PATTERNS = [
    # Priority 1: 核心转化逻辑 — already in Chinese, describes what the video IS about
    re.compile(r"(?:核心转化逻辑|核心转换逻辑)\s*[:：]\s*(?:用|通过|以|利用)?([^\n，,]{8,60})"),
    # Priority 2: 原始文案 — quoted content with context
    re.compile(r"(?:原始文案内容|文案内容|核心台词)\s*[:：]\s*[\"'\u201c\u2018]?([^\"'\u201d\u2019\n]{6,60})", re.I),
    # Priority 3: 视频类型 — combined category label (skip pure labels, keep descriptive ones)
    re.compile(r"(?:视频类型)\s*[:：]\s*([^\n。；;]{4,40})"),
]


def _is_analytical_label(text: str) -> bool:
    """Return True if the text reads like an analytical category, not content description."""
    pure_labels = [
        '情景植入', '场景植入', '产品展示', '剧情', '软植入', '硬广',
        '场景置入', '内容种草', '好物分享', '测评', '开箱', '教程',
        '口播', 'vlog', 'grwm', 'haul', 'tutorial', 'review', 'unboxing',
    ]
    cleaned = re.sub(r'[\s\u00b7\u2022（）()、/]+', '', text.lower())
    for label in pure_labels:
        cleaned = cleaned.replace(label, '')
    return len(cleaned) < 4


def _has_chinese(text: str) -> bool:
    return bool(re.search(r'[\u4e00-\u9fff]', text))


def _is_heading_label(text: str) -> bool:
    return bool(re.match(r'^[\s*\u2022]*(?:视频类型|目标受众|核心用户|主要转化|原始文案|文案技巧'
                          r'|视觉-文案|可复制结构|不能复制|单元\d|结构功能|画面-文案|核心转换'
                          r'|核心转化逻辑|核心营销|内容钩子|情感共鸣|传播潜力|复制建议|痛点'
                          r'|整体脚本|TikTok|报告|模板|说明|预览|Headline|CTA'
                          r')[\s:\*：\u2022]', text))


def _clean_display_title(text: str) -> str:
    text = re.sub(r"[\*_`>#\-\u2022]+", " ", text or "")
    text = re.sub(r"^[\s\d一二三四五六七八九十]+[\.、)]\s*", "", text)
    text = re.sub(r"\s+", " ", text).strip(" ：:，,。.;；\"'\u201c\u201d\u2018\u2019")
    text = re.sub(r"^(用|通过|以|利用|采用)\s*", "", text)
    if len(text) > 36:
        text = text[:36].rstrip(" ，,。.;；") + "\u2026"
    return text


def _build_replica_display_title(video, report):
    """Create a readable Chinese workbench title describing video content."""
    if not report:
        filename = os.path.splitext(video.filename or "")[0]
        return filename or "爆款复刻任务"

    strategy_text = report.strategy or ""
    # Strip markdown bold/italic to help regex
    clean_strategy = re.sub(r'[\*_]{1,2}', '', strategy_text)

    # Step 1: extract from strategy patterns (already Chinese)
    for pattern in _TITLE_PATTERNS:
        match = pattern.search(clean_strategy)
        if not match:
            continue
        title = _clean_display_title(match.group(1))
        if title and not _is_analytical_label(title):
            return title

    # Step 2: find first descriptive Chinese line in strategy
    for raw_line in strategy_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        if _is_heading_label(line):
            continue
        if not _has_chinese(line):
            continue
        cleaned = _clean_display_title(line)
        if cleaned and len(cleaned) >= 6 and not _is_analytical_label(cleaned):
            return cleaned

    # Step 3: script transcription
    script = report.script or ""
    if script:
        first_line = script.split('\n')[0].strip()
        if first_line and len(first_line) >= 6:
            return _clean_display_title(first_line)

    # Step 4: shots first scene description
    shots_text = report.shots or ""
    if shots_text:
        try:
            import json as _json
            shots_data = _json.loads(shots_text) if isinstance(shots_text, str) else shots_text
            if isinstance(shots_data, list) and len(shots_data) > 0:
                desc = shots_data[0].get("description", "")
                if desc and len(desc) >= 10:
                    return _clean_display_title(desc)
        except Exception:
            pass

    if video is not None:
        filename = os.path.splitext(video.filename or "")[0]
        return filename or "爆款复刻任务"
    return "爆款复刻任务"


def _cfg_to_out(cfg: ModelConfig) -> ModelConfigOut:
    providers = cfg.get_providers()
    providers_out: dict[str, ProviderConfigOut] = {}
    for pid in PROVIDER_ORDER:
        p = providers.get(pid, {})
        preset = PROVIDER_PRESETS[pid]
        # Special handling for aliyun: use _aliyun_api_key for configured status
        if pid == "aliyun":
            providers_out[pid] = ProviderConfigOut(
                configured=bool(providers.get("_aliyun_api_key")),
                endpoint=p.get("endpoint") or preset["endpoint"],
                vision_model=p.get("vision_model") or preset.get("vision_model", ""),
                text_model=p.get("text_model") or preset.get("text_model", ""),
            )
        else:
            providers_out[pid] = ProviderConfigOut(
                configured=bool(p.get("api_key")),
                endpoint=p.get("endpoint") or preset["endpoint"],
                vision_model=p.get("vision_model") or preset.get("vision_model", ""),
                text_model=p.get("text_model") or preset.get("text_model", ""),
            )
    return ModelConfigOut(
        id=cfg.id,
        vision_model=cfg.vision_model,
        analysis_model=cfg.analysis_model,
        image_model=cfg.image_model,
        video_model=cfg.video_gen_model,
        providers=providers_out,
        temperature=cfg.temperature or 0.7,
        max_tokens=cfg.max_tokens or 4096,
        laozhang_api_key_configured=bool(providers.get("_laozhang_api_key")),
        volcengine_api_key_configured=bool(providers.get("_volcengine_api_key")),
        aliyun_api_key_configured=bool(providers.get("_aliyun_api_key")),
        updrama_api_key_configured=bool(providers.get("_updrama_api_key")),
        updated_at=cfg.updated_at,
    )


def _get_or_create_cfg(db: Session) -> ModelConfig:
    cfg = db.query(ModelConfig).first()
    if not cfg:
        cfg = ModelConfig()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


# ── Model config endpoints ────────────────────────────────────────────────────

@config_router.get("/models")
def list_models():
    return {"models": SUPPORTED_MODELS}


@config_router.get("/models/current", response_model=ModelConfigOut)
def get_current_config(db: Session = Depends(get_db)):
    cfg = _get_or_create_cfg(db)
    return _cfg_to_out(cfg)


@config_router.patch("/models", response_model=ModelConfigOut)
def update_config(body: ModelConfigUpdate, db: Session = Depends(get_db)):
    cfg = _get_or_create_cfg(db)

    if body.vision_model is not None:
        if body.vision_model not in SUPPORTED_MODELS:
            raise HTTPException(400, f"Unsupported model: {body.vision_model}")
        cfg.vision_model = body.vision_model
    if body.analysis_model is not None:
        if body.analysis_model not in SUPPORTED_MODELS:
            raise HTTPException(400, f"Unsupported model: {body.analysis_model}")
        cfg.analysis_model = body.analysis_model
    if body.image_model is not None:
        cfg.image_model = body.image_model
    if body.video_model is not None:
        cfg.video_gen_model = body.video_model
    if body.temperature is not None:
        cfg.temperature = body.temperature
    if body.max_tokens is not None:
        cfg.max_tokens = body.max_tokens

    if body.providers:
        existing = cfg.get_providers()
        for pid, pu in body.providers.items():
            p = existing.setdefault(pid, {})
            # Only overwrite api_key when the caller actually sends one
            if pu.api_key:
                p["api_key"] = pu.api_key
            if pu.endpoint is not None:
                p["endpoint"] = pu.endpoint
            if pu.vision_model is not None:
                p["vision_model"] = pu.vision_model
            if pu.text_model is not None:
                p["text_model"] = pu.text_model
        cfg.set_providers(existing)

    # Persist standalone generation-model API keys into config_json
    if body.laozhang_api_key or body.volcengine_api_key or body.aliyun_api_key or body.updrama_api_key:
        existing = cfg.get_providers()
        if body.laozhang_api_key:
            existing["_laozhang_api_key"] = body.laozhang_api_key
        if body.volcengine_api_key:
            existing["_volcengine_api_key"] = body.volcengine_api_key
        if body.aliyun_api_key:
            existing["_aliyun_api_key"] = body.aliyun_api_key
        if body.updrama_api_key:
            existing["_updrama_api_key"] = body.updrama_api_key
        cfg.set_providers(existing)

    cfg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cfg)
    return _cfg_to_out(cfg)


@config_router.get("/providers")
def list_provider_presets():
    """Return provider presets (no sensitive data) for frontend defaults."""
    return get_provider_presets()
