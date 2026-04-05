"""DeepSeek implementation — OpenAI-compatible API, text analysis only."""
import logging

from app.ai_models.base import AIModel
from app.config import settings

logger = logging.getLogger(__name__)

MODEL = "deepseek-chat"
BASE_URL = "https://api.deepseek.com"


class DeepSeekModel(AIModel):
    SUPPORTS_VISION = False

    def __init__(self):
        import openai

        if not settings.deepseek_api_key:
            raise ValueError("DEEPSEEK_API_KEY is not configured")
        self._client = openai.OpenAI(api_key=settings.deepseek_api_key, base_url=BASE_URL)

    def analyze_frames(self, images: list[str]) -> list[dict]:
        raise NotImplementedError("DeepSeek does not support vision analysis")

    def analyze_text(self, text: str, task: str) -> str:
        prompt = self._build_prompt(task, text)
        resp = self._client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
        )
        return resp.choices[0].message.content or ""
