"""智谱GLM implementation."""
import logging
from typing import Any

from app.ai_models.base import AIModel, FRAME_PROMPT

logger = logging.getLogger(__name__)

DEFAULT_VISION_MODEL = "glm-4v-plus"
DEFAULT_TEXT_MODEL = "glm-4-plus"


class ZhipuModel(AIModel):
    def __init__(self, cfg: Any = None):
        from zhipuai import ZhipuAI

        api_key = getattr(cfg, 'zhipu_api_key', None) if cfg else None
        if not api_key:
            raise ValueError("智谱 API key not configured. Please set it in Config page.")
        self._client = ZhipuAI(api_key=api_key)
        endpoint = getattr(cfg, 'zhipu_endpoint', None) if cfg else None
        if endpoint:
            self._client.api_base = endpoint
        self._vision_model = (getattr(cfg, 'zhipu_vision_model', None) or DEFAULT_VISION_MODEL) if cfg else DEFAULT_VISION_MODEL
        self._text_model = (getattr(cfg, 'zhipu_text_model', None) or DEFAULT_TEXT_MODEL) if cfg else DEFAULT_TEXT_MODEL

    def analyze_frames(self, images: list[str]) -> list[dict]:
        results = []
        for path in images:
            b64 = self._encode_image(path)
            try:
                resp = self._client.chat.completions.create(
                    model=self._vision_model,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "image_base64", "image_url": f"data:image/jpeg;base64,{b64}"},
                            {"type": "text", "text": FRAME_PROMPT},
                        ],
                    }],
                )
                parsed = self._parse_json_safe(resp.choices[0].message.content)
                results.append(parsed if isinstance(parsed, dict) else {})
            except Exception as e:
                logger.warning("智谱 frame analysis failed for %s: %s", path, e)
                results.append({})
        return results

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._get_task_prompt(task, text)
        try:
            resp = self._client.chat.completions.create(
                model=self._text_model,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.error("智谱 text analysis failed: %s", e)
            raise
