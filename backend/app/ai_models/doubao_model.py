"""豆包2.0 (VolcEngine Ark) implementation — OpenAI-compatible API."""
import logging
from typing import Any

from app.ai_models.base import AIModel, FRAME_PROMPT

logger = logging.getLogger(__name__)

DEFAULT_VISION_MODEL = "doubao-vision-pro-32k"
DEFAULT_TEXT_MODEL = "doubao-pro-32k"


class DoubaoModel(AIModel):
    def __init__(self, cfg: Any = None):
        import openai

        api_key = getattr(cfg, 'doubao_api_key', None) if cfg else None
        if not api_key:
            raise ValueError("豆包 API key not configured. Please set it in Config page.")
        self._client = openai.OpenAI(api_key=api_key)
        endpoint = getattr(cfg, 'doubao_endpoint', None) if cfg else "https://ark.cn-beijing.volces.com/api/v3"
        self._client.base_url = endpoint
        self._vision_model = (getattr(cfg, 'doubao_vision_model', None) or DEFAULT_VISION_MODEL) if cfg else DEFAULT_VISION_MODEL
        self._text_model = (getattr(cfg, 'doubao_text_model', None) or DEFAULT_TEXT_MODEL) if cfg else DEFAULT_TEXT_MODEL

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
                            {"type": "text", "text": FRAME_PROMPT},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                        ],
                    }],
                    max_tokens=500,
                )
                parsed = self._parse_json_safe(resp.choices[0].message.content or "")
                results.append(parsed if isinstance(parsed, dict) else {})
            except Exception as e:
                logger.warning("豆包 frame analysis failed for %s: %s", path, e)
                results.append({})
        return results

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
            logger.error("豆包 text analysis failed: %s", e)
            raise

    def _analyze_single_image(self, b64_image: str, prompt: str, max_tokens: int) -> str:
        """Analyze a single image with custom prompt."""
        try:
            resp = self._client.chat.completions.create(
                model=self._vision_model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"}},
                    ],
                }],
                max_tokens=max_tokens,
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.warning("豆包 single image analysis failed: %s", e)
            return ""
