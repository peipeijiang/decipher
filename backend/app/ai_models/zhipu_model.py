"""智谱GLM implementation — uses urllib to bypass proxy/SSL issues."""
import json
import logging
import ssl
import os
import urllib.request
from typing import Any

from app.ai_models.base import AIModel, FRAME_PROMPT

logger = logging.getLogger(__name__)

DEFAULT_VISION_MODEL = "glm-4v-plus"
DEFAULT_TEXT_MODEL = "glm-4-plus"


class ZhipuModel(AIModel):
    SUPPORTS_VISION = True

    def __init__(self, cfg: Any = None):
        api_key = getattr(cfg, 'zhipu_api_key', None) if cfg else None
        if not api_key:
            raise ValueError("智谱 API key not configured. Please set it in Config page.")
        self._api_key = api_key
        endpoint = getattr(cfg, 'zhipu_endpoint', None) if cfg else "https://open.bigmodel.cn/api/paas/v4"
        self._url = endpoint.rstrip("/") + "/chat/completions"
        self._vision_model = (getattr(cfg, 'zhipu_vision_model', None) or DEFAULT_VISION_MODEL) if cfg else DEFAULT_VISION_MODEL
        self._text_model = (getattr(cfg, 'zhipu_text_model', None) or DEFAULT_TEXT_MODEL) if cfg else DEFAULT_TEXT_MODEL

        # SSL context that bypasses verification (for proxy environments)
        self._ssl_ctx = ssl.create_default_context()
        self._ssl_ctx.check_hostname = False
        self._ssl_ctx.verify_mode = ssl.CERT_NONE

    def _post(self, payload: dict, timeout: int = 60) -> dict:
        """POST to Zhipu API, bypassing proxy env vars."""
        import time

        old_env = {}
        for k in list(os.environ.keys()):
            if 'proxy' in k.lower():
                old_env[k] = os.environ.pop(k)
        try:
            data = json.dumps(payload).encode()
            req = urllib.request.Request(
                self._url,
                data=data,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
            )

            # Retry logic for rate limiting
            last_err = None
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(req, timeout=timeout, context=self._ssl_ctx) as resp:
                        return json.loads(resp.read().decode())
                except urllib.error.HTTPError as e:
                    body = e.read().decode()[:500]
                    last_err = RuntimeError(f"智谱 API error {e.code}: {body}")
                    # Retry on rate limit (429) or server errors (500, 502, 503, 504)
                    if e.code in (429, 500, 502, 503, 504) and attempt < 2:
                        wait = (2 ** attempt) * (60 if e.code == 429 else 5)
                        logger.warning("智谱 %s error, retry %d/3 in %ds", e.code, attempt + 1, wait)
                        time.sleep(wait)
                        continue
                    raise last_err from e
            raise last_err
        finally:
            os.environ.update(old_env)

    def analyze_frames(self, images: list[str]) -> list[dict]:
        results = []
        for path in images:
            b64 = self._encode_image(path)
            try:
                resp = self._post(
                    {
                        "model": self._vision_model,
                        "messages": [{
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                                },
                                {"type": "text", "text": FRAME_PROMPT},
                            ],
                        }],
                        "max_tokens": 500,
                    }
                )
                content = resp.get("choices", [{}])[0].get("message", {}).get("content", "")
                parsed = self._parse_json_safe(content)
                results.append(parsed if isinstance(parsed, dict) else {})
            except urllib.error.HTTPError as e:
                body = e.read().decode()[:300]
                logger.warning("智谱 frame analysis HTTP error %s for %s: %s", e.code, path, body)
                results.append({})
            except Exception as e:
                logger.warning("智谱 frame analysis failed for %s: %s", path, e)
                results.append({})
        return results

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._get_task_prompt(task, text)
        try:
            resp = self._post(
                {
                    "model": self._text_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2048,
                }
            )
            return resp.get("choices", [{}])[0].get("message", {}).get("content", "") or ""
        except Exception as e:
            logger.error("智谱 text analysis failed: %s", e)
            raise

    def _analyze_single_image(self, b64_image: str, prompt: str, max_tokens: int) -> str:
        """Analyze a single image with custom prompt."""
        try:
            resp = self._post(
                {
                    "model": self._vision_model,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"},
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }],
                    "max_tokens": max_tokens,
                }
            )
            return resp.get("choices", [{}])[0].get("message", {}).get("content", "") or ""
        except Exception as e:
            logger.warning("智谱 single image analysis failed: %s", e)
            return ""
