"""Anthropic Claude 3.5 Sonnet implementation."""
import logging

from app.ai_models.base import AIModel, FRAME_PROMPT
from app.config import settings

logger = logging.getLogger(__name__)

MODEL = "claude-3-5-sonnet-20241022"


class ClaudeModel(AIModel):
    def __init__(self):
        import anthropic

        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is not configured")
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def analyze_frames(self, images: list[str]) -> list[dict]:
        results = []
        for path in images:
            b64 = self._encode_image(path)
            try:
                msg = self._client.messages.create(
                    model=MODEL,
                    max_tokens=500,
                    messages=[{
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": "image/jpeg", "data": b64},
                            },
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
            model=MODEL,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text
