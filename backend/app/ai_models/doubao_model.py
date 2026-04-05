"""豆包2.0 (VolcEngine Ark) implementation — OpenAI-compatible API."""
import logging
import os

from app.ai_models.base import AIModel, FRAME_PROMPT
from app.config import settings

logger = logging.getLogger(__name__)

VISION_MODEL = os.getenv("DOUBAO_VISION_MODEL", "doubao-vision-pro-32k")
TEXT_MODEL = os.getenv("DOUBAO_TEXT_MODEL", "doubao-pro-32k")
BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"


class DoubaoModel(AIModel):
    def __init__(self):
        import openai

        if not settings.doubao_api_key:
            raise ValueError("DOUBAO_API_KEY is not configured")
        self._client = openai.OpenAI(api_key=settings.doubao_api_key, base_url=BASE_URL)

    def analyze_frames(self, images: list[str]) -> list[dict]:
        results = []
        for path in images:
            b64 = self._encode_image(path)
            try:
                resp = self._client.chat.completions.create(
                    model=VISION_MODEL,
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
                logger.warning("Doubao frame analysis failed for %s: %s", path, e)
                results.append({})
        return results

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._build_prompt(task, text)
        resp = self._client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
        )
        return resp.choices[0].message.content or ""
