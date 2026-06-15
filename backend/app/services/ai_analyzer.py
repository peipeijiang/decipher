"""High-level AI analysis orchestration — now reads prompts from agent_prompts DB."""
import json
import logging
import re

from sqlalchemy.orm import Session

from app.ai_models.base import AIModel

logger = logging.getLogger(__name__)

# Maps legacy task names → agent_prompt keys
TASK_AGENT_MAP = {
    "strategy": "replica_strategy",
    "shots": "replica_shots",
    "prompt": "replica_prompt_gen",
}


def run_ai_analysis(
    frames: list[str],
    script: str,
    whisper_segments: list[dict],
    vision_model: AIModel,
    analysis_model: AIModel,
    db: Session | None = None,
) -> dict:
    """Run the full AI analysis pipeline.

    When db is provided, loads prompts from agent_prompts table
    instead of the hardcoded defaults in base.py.

    Returns dict with keys: strategy, shots, prompt.
    """
    frame_text = ""
    if vision_model.SUPPORTS_VISION and frames:
        frame_text = _run_frame_analysis(vision_model, frames)

    segments_text = ""
    if whisper_segments:
        segments_text = "\n\n语音分段（带时间戳）：\n"
        for seg in whisper_segments:
            start = seg.get("start", 0)
            end = seg.get("end", 0)
            text = seg.get("text", "").strip()
            segments_text += f"[{start:.1f}s - {end:.1f}s] {text}\n"

    context = f"视频帧分析：\n{frame_text}\n\n语音文字稿：\n{script or '（无语音）'}{segments_text}"
    logger.info("run_ai_analysis: frame_text length=%d, context length=%d", len(frame_text), len(context))

    # Load agent prompts from DB if available
    agent_prompts = {}
    if db:
        try:
            from app.models.agent_prompt import AgentPrompt
            for task, agent_key in TASK_AGENT_MAP.items():
                agent = db.query(AgentPrompt).filter(
                    AgentPrompt.key == agent_key, AgentPrompt.is_active == True
                ).first()
                if agent:
                    agent_prompts[task] = agent
                    logger.info("Loaded agent_prompt: %s (%s)", agent_key, agent.name)
                else:
                    logger.info("Agent prompt '%s' not found, using hardcoded fallback", agent_key)
        except Exception as e:
            logger.warning("Failed to load agent prompts: %s", e)

    try:
        strategy = _safe_analyze(analysis_model, context, "strategy", "（营销策略分析失败）", agent_prompts.get("strategy"))
    except RuntimeError as e:
        raise RuntimeError(f"[综合分析模型] 策略拆解失败: {e}") from e

    try:
        shots_raw = _safe_analyze(analysis_model, context, "shots", "[]", agent_prompts.get("shots"))
        logger.info("shots_raw received (len=%d): %s", len(shots_raw), repr(shots_raw[:200]))
        shots = _extract_json(shots_raw)
    except RuntimeError as e:
        raise RuntimeError(f"[综合分析模型] 场景分析失败: {e}") from e

    try:
        prompt_text = _safe_analyze(analysis_model, context, "prompt", "", agent_prompts.get("prompt"))
    except RuntimeError as e:
        raise RuntimeError(f"[综合分析模型] 提示词生成失败: {e}") from e

    return {"strategy": strategy, "shots": shots, "prompt": prompt_text}


def _run_frame_analysis(model: AIModel, frames: list[str]) -> str:
    try:
        results = model.analyze_frames(frames)
        return _format_frame_results(results)
    except Exception as e:
        logger.warning("Frame analysis failed: %s", e)
        raise RuntimeError(f"[VisionModel/{model.__class__.__name__}] 视频识别模型失败: {e}") from e


def _safe_analyze(model: AIModel, text: str, task: str, fallback: str, agent_prompt=None) -> str:
    """Run analysis using agent_prompt from DB if available, otherwise hardcoded task."""
    try:
        # Use agent prompt from DB if provided
        if agent_prompt:
            system = agent_prompt.system_prompt or ""
            user_tpl = agent_prompt.user_prompt_template or ""
            # Build the full prompt by replacing {{context}} in both system and user template
            full_prompt = system.replace("{{context}}", text)
            if user_tpl:
                full_prompt += "\n\n" + user_tpl.replace("{{context}}", text)
            logger.info("_safe_analyze: using agent_prompt '%s' (len=%d)", agent_prompt.key, len(full_prompt))
            result = model.analyze_text(full_prompt, "direct")
        else:
            result = model.analyze_text(text, task)

        if not result or not result.strip():
            logger.warning("Task '%s' returned empty response, using fallback", task)
            return fallback
        return result
    except Exception as e:
        logger.error("Task '%s' failed: %s", task, e)
        raise RuntimeError(f"[{model.__class__.__name__}] {task} failed: {e}") from e


def _extract_json(text: str) -> str:
    """Strip thinking content and extract clean JSON string."""
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()
    match = re.search(r"(\[[\s\S]*\]|\{[\s\S]*\})", cleaned)
    if match:
        try:
            candidate = match.group(1)
            json.loads(candidate)
            logger.info("_extract_json: successfully extracted JSON (len=%d)", len(candidate))
            return candidate
        except json.JSONDecodeError as je:
            logger.warning("_extract_json: JSON parse failed: %s | candidate[:100]: %s", str(je)[:80], match.group(1)[:100])
    else:
        logger.warning("_extract_json: no JSON pattern found in text (len=%d, startswith=%s)", len(text), repr(text[:50]))
    return text


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
