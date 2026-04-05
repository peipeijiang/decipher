"""Creative rewrite API — generates creative angles + video prompts from a product description."""
import json
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.config import ModelConfig
from app.models.creative_prompt import CreativePrompt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/creative", tags=["creative"])

ANGLE_SYSTEM_PROMPT_TEMPLATE = """你是一位顶级的TikTok短视频营销策划专家。
根据用户提供的产品描述（和可选的产品图片），生成{count}个不同的创意视频角度。{style_instruction}

每个角度必须严格按照以下JSON格式输出，整体输出为JSON数组：
[
  {{
    "index": 1,
    "title": "角度标题（简短有力）",
    "hook_visual": "视觉钩子描述",
    "hook_copy": "文案钩子（引号内的台词）",
    "concept": "视频概念和拍摄思路",
    "why": "为什么这个角度适合该产品和目标受众"
  }}
]

要求：
- 角度要多样化，覆盖不同场景和受众痛点
- Hook要有强烈的视觉冲击力和情绪共鸣
- Concept要具体可执行，包含镜头语言描述
- 只输出JSON数组，不要有其他文字
"""

STYLE_INSTRUCTIONS = {
    "general": "",
    "ugc": "\n风格要求：所有角度必须采用UGC自拍风格——手持拍摄、自然光、真实素人感、第一人称视角、无滤镜质感、像素略粗糙但真实可信。",
    "professional": "\n风格要求：所有角度采用专业广告风格——精心布光、专业摄影师拍摄、高质感画面、品牌调性统一、精致剪辑。",
    "lifestyle": "\n风格要求：所有角度采用生活方式风格——自然场景融入、真实生活场景、情感共鸣、温暖色调、故事性强。",
}

PROMPT_SYSTEM_PROMPT = """You are a professional TikTok video director and prompt engineer.
Given the product information and creative angle, generate a detailed English video shooting prompt.

Output STRICTLY in this format (all English, no other text):

[Title] <short catchy video title>
[Style] <filming style, camera type, quality, blogger persona description — include physical appearance details, clothing, energy>
[Prose] <product name, key specs, environment/setting, what the blogger demonstrates>
[Cinematography] <camera movements, shot types, framing, editing style>
[Lighting] <lighting setup, color temperature, color palette>
[Actions] 0-3s <action>. 3-7s <action>. 7-10s <action>. 10-15s <action>.
[Audio] VO: "<voiceover script>" SFX: <sound effects description>

Rules:
- Output ONLY the formatted sections above, nothing else
- Everything must be in English
- [Actions] must include all four timestamps: 0-3s, 3-7s, 7-10s, 10-15s
- VO must be natural, conversational TikTok creator style
- [Style] persona should be specific: face features, hair, outfit, energy/vibe
- Keep each section concise but vivid and actionable
"""


PROMPT_STYLE_SUFFIX = {
    "ugc": " Shoot in authentic UGC selfie style: handheld shaky camera, natural lighting, no filters, raw real-person energy, first-person POV.",
    "professional": " Shoot in professional ad style: studio lighting, cinematic camera work, polished editing, premium brand feel.",
    "lifestyle": " Shoot in lifestyle vlog style: natural settings, warm tones, emotional storytelling, candid moments.",
    "general": "",
}


@router.post("/generate")
async def generate_creative(
    description: str = Form(...),
    image: UploadFile | None = File(None),
    count: int = Form(5),
    style: str = Form("general"),
    video_id: str | None = Form(None),
    db: Session = Depends(get_db),
):
    count = max(1, min(count, 10))
    style = style if style in STYLE_INSTRUCTIONS else "general"
    cfg = db.query(ModelConfig).first() or ModelConfig()

    # Load the analysis model
    try:
        from app.ai_models import get_model
        model = get_model(cfg.analysis_model, cfg)
    except Exception as e:
        raise HTTPException(500, f"模型加载失败: {e}")

    # Optionally save uploaded image
    image_path: str | None = None
    if image and image.filename:
        import tempfile, os
        suffix = os.path.splitext(image.filename)[1] or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(await image.read())
            image_path = f.name

    angle_system_prompt = ANGLE_SYSTEM_PROMPT_TEMPLATE.format(
        count=count,
        style_instruction=STYLE_INSTRUCTIONS[style],
    )
    prompt_system_prompt = PROMPT_SYSTEM_PROMPT + PROMPT_STYLE_SUFFIX[style]

    # Step 1: Generate creative angles
    try:
        angles_raw = _call_text(model, cfg, angle_system_prompt, description, image_path)
        import json, re
        angles = _parse_json_array(angles_raw)
        if not angles:
            raise ValueError(f"No JSON array in response: {angles_raw[:200]}")
    except Exception as e:
        logger.error("Angle generation failed: %s", e)
        raise HTTPException(500, f"创意角度生成失败: {e}")

    # Step 2: Generate a video prompt for each angle
    results = []
    import time
    for i, angle in enumerate(angles):
        try:
            user_msg = f"产品描述：{description}\n\n创意角度：\n标题：{angle.get('title','')}\nHook（视觉）：{angle.get('hook_visual','')}\nHook（文案）：{angle.get('hook_copy','')}\nConcept：{angle.get('concept','')}"
            prompt_text = _call_text(model, cfg, PROMPT_SYSTEM_PROMPT, user_msg, image_path)
            results.append({"angle": angle, "prompt": prompt_text.strip()})
            # Add delay between requests to avoid rate limiting (skip after last angle)
            if i < len(angles) - 1:
                time.sleep(2)
        except Exception as e:
            logger.error("Prompt generation failed for angle %s: %s", angle.get("index"), e)
            results.append({"angle": angle, "prompt": ""})

    # Cleanup temp image
    if image_path:
        import os
        try:
            os.unlink(image_path)
        except Exception:
            pass

    # Save to history
    record = CreativePrompt(
        id=str(uuid.uuid4()),
        description=description,
        results=json.dumps(results, ensure_ascii=False),
        video_id=video_id or None,
        created_at=datetime.utcnow(),
    )
    db.add(record)
    db.commit()

    return {"id": record.id, "results": results}


@router.get("/history")
def list_creative_history(video_id: str | None = None, standalone: bool = False, db: Session = Depends(get_db)):
    q = db.query(CreativePrompt)
    if video_id:
        q = q.filter(CreativePrompt.video_id == video_id)
    elif standalone:
        q = q.filter(CreativePrompt.video_id == None)  # noqa: E711
    items = q.order_by(CreativePrompt.created_at.desc()).limit(50).all()
    return [
        {
            "id": item.id,
            "description": item.description,
            "results": json.loads(item.results),
            "video_id": item.video_id,
            "created_at": item.created_at.isoformat(),
        }
        for item in items
    ]


@router.delete("/history/{item_id}")
def delete_creative_history(item_id: str, db: Session = Depends(get_db)):
    item = db.get(CreativePrompt, item_id)
    if not item:
        raise HTTPException(404, "Not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


def _parse_json_array(text: str) -> list:
    """Extract and parse a JSON array from text, handling code fences."""
    import json, re
    # Strip ```json ... ``` fences (multiline)
    cleaned = re.sub(r'```(?:json)?\s*', '', text, flags=re.MULTILINE)
    m = re.search(r'\[[\s\S]*\]', cleaned)
    if not m:
        return []
    try:
        return json.loads(m.group())
    except json.JSONDecodeError:
        return []


def _call_text(model, cfg, system_prompt: str, user_msg: str, image_path: str | None = None) -> str:
    """Call the model with a system+user message pair."""
    # Try OpenAI-compatible client directly for system prompt support
    provider = getattr(cfg, 'analysis_model', '') or ''

    # Use the model's underlying client if available
    if hasattr(model, '_client'):
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ]
        # Add image if provided and model supports vision
        if image_path and model.SUPPORTS_VISION:
            import base64
            with open(image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            messages[-1]["content"] = [
                {"type": "text", "text": user_msg},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]

        # OpenAI / compatible
        if hasattr(model._client, 'chat'):
            text_model = getattr(model, '_text_model', None) or getattr(model, '_vision_model', 'gpt-4o')
            resp = model._client.chat.completions.create(
                model=text_model,
                messages=messages,
                max_tokens=4096,
            )
            return resp.choices[0].message.content or ""

        # Anthropic
        if hasattr(model._client, 'messages'):
            import anthropic
            text_model = getattr(model, '_text_model', None) or getattr(model, '_vision_model', 'claude-3-5-sonnet-20241022')
            resp = model._client.messages.create(
                model=text_model,
                system=system_prompt,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=4096,
            )
            return resp.content[0].text if resp.content else ""

    # Fallback: use chat() if available (avoids task-template wrapping)
    if hasattr(model, 'chat'):
        import inspect
        sig = inspect.signature(model.chat)
        if 'max_tokens' in sig.parameters:
            return model.chat(system_prompt, user_msg, max_tokens=4096)
        return model.chat(system_prompt, user_msg)

    # Last resort: combine into single user message and send as raw text
    combined = f"{system_prompt}\n\n---\n\n{user_msg}"
    return model.analyze_text(combined, "direct")
