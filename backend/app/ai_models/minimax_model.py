"""MiniMax implementation — OpenAI-compatible API."""
import logging

from app.ai_models.base import AIModel, FRAME_PROMPT
from app.config import settings

logger = logging.getLogger(__name__)

MODEL = "MiniMax-Text-01"
BASE_URL = "https://api.minimax.chat/v1"


class MinimaxModel(AIModel):
    def __init__(self):
        import openai

        if not settings.minimax_api_key:
            raise ValueError("MINIMAX_API_KEY is not configured")
        self._client = openai.OpenAI(api_key=settings.minimax_api_key, base_url=BASE_URL)

    def analyze_frames(self, images: list[str]) -> list[dict]:
        results = []
        for path in images:
            b64 = self._encode_image(path)
            try:
                resp = self._client.chat.completions.create(
                    model=MODEL,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": FRAME_PROMPT},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                        ],
                    }],
                    max_tokens=500,
                )
                parsed = self._parse_json_safe(resp.choices[0].message.content or "")
                results.append(parsed if isinstance(parsed, dict) else {})
            except Exception as e:
                logger.warning("MiniMax frame analysis failed for %s: %s", path, e)
                results.append({})
        return results

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._build_prompt(task, text)
        resp = self._client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
        )
        return resp.choices[0].message.content or ""
