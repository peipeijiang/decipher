"""Anthropic Claude 3.5 Sonnet implementation."""
import logging
from typing import Any

from app.ai_models.base import AIModel, FRAME_PROMPT

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-3-5-sonnet-20241022"


class ClaudeModel(AIModel):
    def __init__(self, cfg: Any = None):
        import anthropic

        api_key = getattr(cfg, 'anthropic_api_key', None) if cfg else None
        if not api_key:
            raise ValueError("Claude API key not configured. Please set it in Config page.")
        self._client = anthropic.Anthropic(api_key=api_key)
        endpoint = getattr(cfg, 'anthropic_endpoint', None) if cfg else None
        if endpoint:
            self._client.base_url = endpoint
        self._vision_model = (getattr(cfg, 'claude_vision_model', None) or DEFAULT_MODEL) if cfg else DEFAULT_MODEL
        self._text_model = (getattr(cfg, 'claude_text_model', None) or DEFAULT_MODEL) if cfg else DEFAULT_MODEL

    def analyze_frames(self, images: list[str]) -> list[dict]:
        results = []
        for path in images:
            b64 = self._encode_image(path)
            try:
                msg = self._client.messages.create(
                    model=self._vision_model,
                    max_tokens=500,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                            {"type": "text", "text": FRAME_PROMPT},
                        ],
                    }],
                )
                parsed = self._parse_json_safe(msg.content[0].text)
                results.append(parsed if isinstance(parsed, dict) else {})
            except Exception as e:
                logger.warning("Claude frame analysis failed for %s: %s", path, e)
                results.append({})
        return results

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._build_prompt(task, text)
        msg = self._client.messages.create(
            model=self._text_model,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text
