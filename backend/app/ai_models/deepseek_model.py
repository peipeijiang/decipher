"""DeepSeek implementation — OpenAI-compatible API, text analysis only."""
import logging
from typing import Any

from app.ai_models.base import AIModel

logger = logging.getLogger(__name__)

DEFAULT_TEXT_MODEL = "deepseek-chat"


class DeepSeekModel(AIModel):
    SUPPORTS_VISION = False

    def __init__(self, cfg: Any = None):
        import openai

        api_key = getattr(cfg, 'deepseek_api_key', None) if cfg else None
        if not api_key:
            raise ValueError("DeepSeek API key not configured. Please set it in Config page.")
        self._client = openai.OpenAI(api_key=api_key)
        endpoint = getattr(cfg, 'deepseek_endpoint', None) if cfg else "https://api.deepseek.com/v1"
        self._client.base_url = endpoint
        self._text_model = (getattr(cfg, 'deepseek_text_model', None) or DEFAULT_TEXT_MODEL) if cfg else DEFAULT_TEXT_MODEL

    def analyze_frames(self, images: list[str]) -> list[dict]:
        raise NotImplementedError("DeepSeek does not support vision analysis")

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
            logger.error("DeepSeek text analysis failed: %s", e)
            raise

    def chat(self, system_prompt: str, user_msg: str, max_tokens: int = 2048) -> str:
        """Run a system/user chat completion for agent prompts."""
        try:
            resp = self._client.chat.completions.create(
                model=self._text_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.error("DeepSeek chat failed: %s", e)
            raise
