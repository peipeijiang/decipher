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
    "direct": "{{context}}",
    "strategy": (
        "你是资深TikTok内容营销专家。根据以下视频帧分析和语音文字稿，"
        "生成专业的营销策略分析报告（Markdown格式）。\n\n"
        "{{context}}\n\n"
        "请输出以下章节：\n"
        "## 核心营销策略\n## 目标受众分析\n## 内容钩子分析\n"
        "## 情感共鸣点\n## 传播潜力评估\n## 复制建议"
    ),
    "shots": (
        "根据以下视频帧分析（按时间顺序排列）和语音分段，生成分镜场景分析。\n\n"
        "{{context}}\n\n"
        "【关键要求】\n"
        "1. 你收到了 N 个视频帧（按时间顺序），必须为每一个帧输出一个独立分镜，JSON数组必须恰好有 N 个元素，禁止合并或省略任何帧\n"
        "2. 如果提供了语音分段（带时间戳），必须将对应时间段的对话内容填入 dialogue 字段，禁止留空或填 null\n"
        "3. 每个分镜的 timestamp 应该对应该帧在视频中的大致时间位置\n"
        "4. 只返回JSON数组，不要其他内容\n\n"
        "输出格式示例：\n"
        '[{{"index":1,"timestamp":"0-3s","description":"帧1场景描述","camera_angle":"特写","composition":"中心构图","dialogue":"对应时间段的对话内容","purpose":"吸引注意"}},{{"index":2,"timestamp":"3-6s","description":"帧2场景描述","camera_angle":"中景","composition":"对称构图","dialogue":"对应时间段的对话内容","purpose":"内容展开"}}]'
    ),
    "prompt": (
        "You are an expert at creating AI video generation prompts. "
        "Based on the following TikTok video analysis, create a detailed English prompt "
        "that can be directly pasted into AI video tools like Sora, 即梦 (Jimeng), Kling, or Pika.\n\n"
        "{{context}}\n\n"
        "Output ONLY the plain text prompt below — no JSON, no markdown headers, no explanations:\n\n"
        "STYLE: [Overall visual style, color grading, atmosphere in 1-2 sentences]\n"
        "MOOD: [Emotional tone and energy]\n"
        "CAMERA: [Primary camera technique and movement]\n"
        "LIGHTING: [Lighting quality and setup]\n\n"
        "SHOTS:\n"
        "Shot 1 [0s-Xs]: [Detailed scene description]\n"
        "  Camera: [angle/movement]\n"
        "  Dialogue: [exact spoken words, or 'none']\n"
        "  Sound: [background audio atmosphere]\n\n"
        "Shot 2 [Xs-Ys]: [scene description]\n"
        "  ...\n\n"
        "(Continue for every shot in the video)\n\n"
        "Write in English. Be vivid and specific. The output should work as a direct copy-paste prompt."
    ),
    "adapt": (
        "Based on the following viral TikTok video analysis and your product image, generate a complete English prompt that can be directly used to recreate a similar video with your product.\n\n"
        "{{context}}\n\n"
        "Output format (write ONLY the prompt, no explanations, no JSON, no numbering):\n\n"
        "Style: [Overall visual style and mood]\n"
        "Cinematography:\nCamera: [Camera movement and technique]\n"
        "Lens: [Lens type and focal length]\n"
        "Lighting: [Lighting setup and quality]\n"
        "Mood: [Emotional tone]\n\n"
        "Shots\n\n"
        "Shot 1\n"
        "Duration: [Start time - End time]\n"
        "Scene: [Detailed scene description in English]\n"
        "Dialogue: [Exact dialogue/narration if available, or leave blank]\n"
        "Background Sound: [Sound atmosphere description]\n\n"
        "... (continue for all shots)\n\n"
        "IMPORTANT: Output in English only. Can be used directly in AI video tools."
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
        template = TASK_PROMPTS.get(task, "{{context}}")
        # Escape {{ and }} to avoid format string issues, then use replace instead of format
        escaped = context.replace('{{', '{{{{').replace('}}', '}}}}')
        return template.replace('{{context}}', escaped)

    # Alias for models that call _get_task_prompt
    _get_task_prompt = _build_prompt
