"""MiniMax implementation — Anthropic API endpoint."""
import json
import logging
import ssl
import os
import urllib.request
from typing import Any

from app.ai_models.base import AIModel, FRAME_PROMPT

logger = logging.getLogger(__name__)

DEFAULT_TEXT_MODEL = "MiniMax-Text-01"


class MinimaxModel(AIModel):
    SUPPORTS_VISION = False  # MiniMax 目前不支持视觉

    def __init__(self, cfg: Any = None):
        api_key = getattr(cfg, 'minimax_api_key', None) if cfg else None
        if not api_key:
            raise ValueError("MiniMax API key not configured. Please set it in Config page.")
        self._api_key = api_key
        endpoint = getattr(cfg, 'minimax_endpoint', None) if cfg else "https://api.minimaxi.com/anthropic"
        self._url = endpoint.rstrip("/") + "/v1/messages"

        # Create SSL context that bypasses verification (for proxy environments)
        self._ssl_ctx = ssl.create_default_context()
        self._ssl_ctx.check_hostname = False
        self._ssl_ctx.verify_mode = ssl.CERT_NONE

    def _post(self, payload: dict, timeout: int = 120) -> dict:
        """Make a POST request to the MiniMax Anthropic API, bypassing proxy env vars."""
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
                    "anthropic-version": "2023-06-01",
                },
            )
            last_err = None
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(req, timeout=timeout, context=self._ssl_ctx) as resp:
                        return json.loads(resp.read().decode())
                except urllib.error.HTTPError as e:
                    body = e.read().decode()[:500]
                    last_err = RuntimeError(f"MiniMax API error {e.code}: {body}")
                    if e.code in (500, 502, 503, 504, 529) and attempt < 2:
                        wait = (2 ** attempt) * (30 if e.code == 529 else 1)
                        logger.warning("MiniMax %s error, retry %d/3 in %ds", e.code, attempt + 1, wait)
                        time.sleep(wait)
                        continue
                    raise last_err from e
            raise last_err
        finally:
            os.environ.update(old_env)

    def chat(self, system_prompt: str, user_msg: str, max_tokens: int = 2048) -> str:
        """Direct chat with system + user messages, bypassing task templates."""
        # MiniMax Anthropic endpoint doesn't support top-level system field;
        # prepend system prompt as a user message prefix instead.
        combined = f"{system_prompt}\n\n---\n\n{user_msg}"
        result = self._post(
            {
                "model": "MiniMax-M2.7",
                "messages": [{"role": "user", "content": combined}],
                "max_tokens": max_tokens,
            },
            timeout=300,
        )
        content_blocks = result.get("content", [])
        return "".join(b.get("text", "") for b in content_blocks if b.get("type") == "text")

    def analyze_frames(self, images: list[str]) -> list[dict]:
        raise NotImplementedError("MiniMax does not support vision analysis")

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._get_task_prompt(task, text)
        try:
            result = self._post(
                {
                    "model": "MiniMax-M2.7",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 4096,
                },
                timeout=300,
            )
            # Anthropic endpoint returns content blocks: [{type: "thinking"}, {type: "text", text: "..."}]
            # We only want the text blocks, skipping thinking
            content_blocks = result.get("content", [])
            text_parts = []
            for block in content_blocks:
                if block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
            return "".join(text_parts)
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:500]
            logger.error("MiniMax HTTP error %s: %s", e.code, body)
            raise RuntimeError(f"MiniMax API error {e.code}: {body}") from e
        except Exception as e:
            logger.error("MiniMax text analysis failed: %s", e)
            raise
