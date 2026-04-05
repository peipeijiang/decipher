"""Abstract base class and shared prompts for all AI model implementations."""
import base64
import json
import re
from abc import ABC, abstractmethod
from pathlib import Path


FRAME_PROMPT = (
    "分析这个TikTok视频帧，以JSON格式返回如下字段，只返回JSON不要其他内容：\n"
    '{"description":"画面整体描述","camera_angle":"摄影角度（特写/中景/远景/俯视/仰视等）",'
    '"lighting":"光线描述（自然光/室内灯光/逆光/柔光等）",'
    '"composition":"画面构图（中心构图/三分法/对称构图等）",'
    '"mood":"情绪氛围（活泼/严肃/温馨/紧张等）","subject":"主体对象描述"}'
)

TASK_PROMPTS = {
    "strategy": (
        "你是资深TikTok内容营销专家。根据以下视频帧分析和语音文字稿，"
        "生成专业的营销策略分析报告（Markdown格式）。\n\n"
        "{context}\n\n"
        "请输出以下章节：\n"
        "## 核心营销策略\n## 目标受众分析\n## 内容钩子分析\n"
        "## 情感共鸣点\n## 传播潜力评估\n## 复制建议"
    ),
    "shots": (
        "根据以下视频帧分析，生成分镜场景分析。\n\n"
        "{context}\n\n"
        "以JSON数组格式返回，每个元素代表一个分镜，只返回JSON不要其他内容：\n"
        '[{"index":1,"timestamp":"0-5s","description":"场景描述",'
        '"camera_angle":"摄影角度","composition":"构图方式","purpose":"营销目的"}]'
    ),
    "prompt": (
        "根据以下TikTok视频分析，生成可复用的AI创作提示词，帮助创作者复制成功元素。\n\n"
        "{context}\n\n"
        "请生成：\n"
        "### 1. 视频脚本提示词\n### 2. 视觉风格���示词（Midjourney/SD）\n"
        "### 3. 拍摄技巧提示词\n### 4. 营销文案模板"
    ),
}


class AIModel(ABC):
    """Abstract base for all AI model implementations."""

    SUPPORTS_VISION: bool = True

    @abstractmethod
    def analyze_frames(self, images: list[str]) -> list[dict]:
        """Analyze video frames with vision capabilities.

        Args:
            images: File paths to frame images.

        Returns:
            List of dicts per frame with keys:
            description, camera_angle, lighting, composition, mood, subject.
        """

    @abstractmethod
    def analyze_text(self, text: str, task: str) -> str:
        """Run a text analysis task.

        Args:
            text: Combined frame descriptions + script context.
            task: "strategy" | "shots" | "prompt"

        Returns:
            Analysis string (JSON string for "shots" task).
        """

    @staticmethod
    def _encode_image(path: str) -> str:
        """Return base64-encoded image bytes."""
        return base64.b64encode(Path(path).read_bytes()).decode()

    @staticmethod
    def _parse_json_safe(text: str) -> dict | list:
        """Extract and parse the first JSON object or array from text."""
        text = text.strip()
        match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        return {}

    def _build_prompt(self, task: str, context: str) -> str:
        template = TASK_PROMPTS.get(task, "{context}")
        return template.format(context=context)
