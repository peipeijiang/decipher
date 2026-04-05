"""Stub AI analyzer — real implementations wired in Phase 3."""
import logging

logger = logging.getLogger(__name__)


def analyze_frames(frame_paths: list[str], model_name: str) -> str:
    """Send frames to vision model; returns description string."""
    logger.info("analyze_frames: model=%s, frames=%d", model_name, len(frame_paths))
    return ""


def analyze_strategy(frame_desc: str, script: str, model_name: str) -> str:
    logger.info("analyze_strategy: model=%s", model_name)
    return "# 营销策略分析\n\n（AI 分析将在此处显示）"


def analyze_shots(frame_desc: str, model_name: str) -> str:
    logger.info("analyze_shots: model=%s", model_name)
    return "[]"


def generate_prompt(frame_desc: str, model_name: str) -> str:
    logger.info("generate_prompt: model=%s", model_name)
    return ""
