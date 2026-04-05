"""High-level AI analysis orchestration."""
import logging

from app.ai_models.base import AIModel

logger = logging.getLogger(__name__)


def run_ai_analysis(
    frames: list[str],
    script: str,
    vision_model: AIModel,
    analysis_model: AIModel,
) -> dict:
    """Run the full AI analysis pipeline.

    Returns dict with keys: strategy, shots, prompt.
    """
    frame_text = ""
    if vision_model.SUPPORTS_VISION and frames:
        frame_text = _run_frame_analysis(vision_model, frames)

    context = f"视频帧分析：\n{frame_text}\n\n语音文字稿：\n{script or '（无语音）'}"

    strategy = _safe_analyze(analysis_model, context, "strategy", "（营销策略分析失败）")
    shots = _safe_analyze(analysis_model, frame_text or context, "shots", "[]")
    prompt_text = _safe_analyze(analysis_model, context, "prompt", "")

    return {"strategy": strategy, "shots": shots, "prompt": prompt_text}


def _run_frame_analysis(model: AIModel, frames: list[str]) -> str:
    try:
        results = model.analyze_frames(frames)
        return _format_frame_results(results)
    except Exception as e:
        logger.warning("Frame analysis failed: %s", e)
        return ""


def _safe_analyze(model: AIModel, text: str, task: str, fallback: str) -> str:
    try:
        return model.analyze_text(text, task)
    except Exception as e:
        logger.error("Task '%s' failed: %s", task, e)
        return fallback


def _format_frame_results(results: list[dict]) -> str:
    lines = []
    for i, r in enumerate(results, 1):
        parts = [
            f"帧{i}：{r.get('description', '')}",
            f"角度：{r.get('camera_angle', '')}",
            f"光线：{r.get('lighting', '')}",
            f"构图：{r.get('composition', '')}",
            f"情绪：{r.get('mood', '')}",
            f"主体：{r.get('subject', '')}",
        ]
        lines.append("，".join(p for p in parts if p.split("：", 1)[-1]))
    return "\n".join(lines)
