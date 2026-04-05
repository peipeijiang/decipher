"""智谱GLM implementation."""
import logging

from app.ai_models.base import AIModel, FRAME_PROMPT
from app.config import settings

logger = logging.getLogger(__name__)

VISION_MODEL = "glm-4v-plus"
TEXT_MODEL = "glm-4-plus"


class ZhipuModel(AIModel):
    def __init__(self):
        from zhipuai import ZhipuAI

        if not settings.zhipu_api_key:
            raise ValueError("ZHIPU_API_KEY is not configured")
        self._client = ZhipuAI(api_key=settings.zhipu_api_key)

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
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                            {"type": "text", "text": FRAME_PROMPT},
                        ],
                    }],
                )
                parsed = self._parse_json_safe(resp.choices[0].message.content or "")
                results.append(parsed if isinstance(parsed, dict) else {})
            except Exception as e:
                logger.warning("Zhipu frame analysis failed for %s: %s", path, e)
                results.append({})
        return results

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._build_prompt(task, text)
        resp = self._client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or ""
