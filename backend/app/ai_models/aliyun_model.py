"""Aliyun DashScope (Qwen-VL) implementation — uses urllib to bypass proxy/SSL issues."""
import json
import logging
import os
import ssl
import urllib.request
from typing import Any

from app.ai_models.base import AIModel, FRAME_PROMPT

logger = logging.getLogger(__name__)

DEFAULT_VISION_MODEL = "qwen3-vl-plus"
DEFAULT_TEXT_MODEL = "qwen3.6-plus"
DEFAULT_MULTIMODAL_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
DEFAULT_TEXT_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

# Vision models that require multimodal endpoint
VISION_MODELS = {"qwen-vl-max-latest", "qwen3-vl-plus", "qwen3-vl-flash"}


class AliyunModel(AIModel):
    SUPPORTS_VISION = True

    def __init__(self, cfg: Any = None):
        api_key = getattr(cfg, "aliyun_api_key", None) if cfg else None
        if not api_key:
            raise ValueError("阿里云 API key not configured. Please set it in Config page.")
        self._api_key = api_key

        self._vision_model = (
            getattr(cfg, "aliyun_vision_model", None) or DEFAULT_VISION_MODEL
        ) if cfg else DEFAULT_VISION_MODEL
        self._text_model = (
            getattr(cfg, "aliyun_text_model", None) or DEFAULT_TEXT_MODEL
        ) if cfg else DEFAULT_TEXT_MODEL

        # Determine endpoint based on model type
        self._multimodal_endpoint = DEFAULT_MULTIMODAL_ENDPOINT
        self._text_endpoint = DEFAULT_TEXT_ENDPOINT

        self._ssl_ctx = ssl.create_default_context()
        self._ssl_ctx.check_hostname = False
        self._ssl_ctx.verify_mode = ssl.CERT_NONE

    def _post(self, url: str, payload: dict, timeout: int = 120) -> dict:
        """POST to DashScope API, bypassing proxy env vars."""
        old_env = {}
        for k in list(os.environ.keys()):
            if "proxy" in k.lower():
                old_env[k] = os.environ.pop(k)
        try:
            data = json.dumps(payload).encode()
            req = urllib.request.Request(
                url,
                data=data,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout, context=self._ssl_ctx) as resp:
                return json.loads(resp.read().decode())
        finally:
            os.environ.update(old_env)

    def analyze_frames(self, images: list[str]) -> list[dict]:
        results = []
        # Use multimodal endpoint for vision models
        endpoint = self._multimodal_endpoint if self._vision_model in VISION_MODELS else self._text_endpoint

        for path in images:
            b64 = self._encode_image(path)
            try:
                resp = self._post(
                    endpoint,
                    {
                        "model": self._vision_model,
                        "input": {
                            "messages": [
                                {
                                    "role": "user",
                                    "content": [
                                        {"image": f"data:image/jpeg;base64,{b64}"},
                                        {"text": FRAME_PROMPT},
                                    ],
                                }
                            ]
                        },
                    },
                )
                content = (
                    resp.get("output", {})
                    .get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )
                # Handle list-style content (Qwen-VL may return [{type, text}])
                if isinstance(content, list):
                    content = "".join(
                        item.get("text", "") for item in content if isinstance(item, dict)
                    )
                parsed = self._parse_json_safe(content)
                results.append(parsed if isinstance(parsed, dict) else {})
            except urllib.error.HTTPError as e:
                body = e.read().decode()[:300]
                logger.warning("阿里云 frame analysis HTTP error %s for %s: %s", e.code, path, body)
                results.append({})
            except Exception as e:
                logger.warning("阿里云 frame analysis failed for %s: %s", path, e)
                results.append({})
        return results

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._get_task_prompt(task, text)
        try:
            resp = self._post(
                self._text_endpoint,
                {
                    "model": self._text_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2048,
                },
            )
            return (
                resp.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                or ""
            )
        except Exception as e:
            logger.error("阿里云 text analysis failed: %s", e)
            raise
