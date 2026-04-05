"""MiniMax implementation — OpenAI-compatible API."""
import logging
from typing import Any

from app.ai_models.base import AIModel, FRAME_PROMPT

logger = logging.getLogger(__name__)

DEFAULT_TEXT_MODEL = "MiniMax-Text-01"


class MinimaxModel(AIModel):
    SUPPORTS_VISION = False  # MiniMax 目前不支持视觉

    def __init__(self, cfg: Any = None):
        import openai

        api_key = getattr(cfg, 'minimax_api_key', None) if cfg else None
        if not api_key:
            raise ValueError("MiniMax API key not configured. Please set it in Config page.")
        self._client = openai.OpenAI(api_key=api_key)
        endpoint = getattr(cfg, 'minimax_endpoint', None) if cfg else "https://api.minimax.chat/v1"
        self._client.base_url = endpoint
        self._text_model = (getattr(cfg, 'minimax_text_model', None) or DEFAULT_TEXT_MODEL) if cfg else DEFAULT_TEXT_MODEL

    def analyze_frames(self, images: list[str]) -> list[dict]:
        raise NotImplementedError("MiniMax does not support vision analysis")

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._get_task_prompt(task, text)
        try:
            resp = self._client.chat.completions.create(
                model=self._text_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2048,
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.error("MiniMax text analysis failed: %s", e)
            raise
