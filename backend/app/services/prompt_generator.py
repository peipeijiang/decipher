"""Template-based marketing video prompt generator."""
import json
import logging

from app.ai_models.base import AIModel

logger = logging.getLogger(__name__)

# Fallback templates (used if database is unavailable)
TEMPLATES = {
    "grwm": {
        "name": "GRWM 随性博主",
        "structure": (
            "[Equipment] Shot with iPhone front camera\n"
            "[Video Style] TikTok GRWM (Get Ready With Me), casual influencer style\n"
            "[Video Music] Upbeat trending pop\n"
            "[Video Effects] Jump cuts, outfit transition, text overlay\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "unboxing": {
        "name": "开箱测评",
        "structure": (
            "[Equipment] Shot with iPhone rear camera, overhead angle\n"
            "[Video Style] TikTok unboxing, ASMR-style with close-ups\n"
            "[Video Music] Lo-fi chill beat\n"
            "[Video Effects] Slow-mo reveals, zoom transitions, text overlay\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "pov": {
        "name": "POV 第一人称",
        "structure": (
            "[Equipment] Shot with iPhone handheld, first-person perspective\n"
            "[Video Style] TikTok POV (Point of View), immersive experience\n"
            "[Video Music] Trending audio or voiceover\n"
            "[Video Effects] Smooth transitions, text captions, immersive angles\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "tutorial": {
        "name": "教程演示",
        "structure": (
            "[Equipment] Shot with iPhone rear camera, stable tripod\n"
            "[Video Style] TikTok tutorial, step-by-step demonstration\n"
            "[Video Music] Soft background music\n"
            "[Video Effects] Step numbers, arrows, text annotations, zoom-ins\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "vlog": {
        "name": "日常 Vlog",
        "structure": (
            "[Equipment] Shot with iPhone, natural handheld\n"
            "[Video Style] TikTok daily vlog, authentic lifestyle integration\n"
            "[Video Music] Chill indie or acoustic\n"
            "[Video Effects] Natural cuts, subtle filters, casual text\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "storytelling": {
        "name": "剧情反转",
        "structure": (
            "[Equipment] Shot with iPhone, cinematic angles\n"
            "[Video Style] TikTok storytelling with plot twist\n"
            "[Video Music] Dramatic build-up music\n"
            "[Video Effects] Suspenseful cuts, reveal transitions, text punchline\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "asmr": {
        "name": "ASMR 特写",
        "structure": (
            "[Equipment] Shot with iPhone rear camera, macro close-ups\n"
            "[Video Style] TikTok ASMR, satisfying textures and sounds\n"
            "[Video Music] Ambient sounds or soft ASMR audio\n"
            "[Video Effects] Slow motion, extreme close-ups, smooth pans\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
    "challenge": {
        "name": "挑战种草",
        "structure": (
            "[Equipment] Shot with iPhone, dynamic angles\n"
            "[Video Style] TikTok challenge or trending format\n"
            "[Video Music] Viral trending sound\n"
            "[Video Effects] Fast cuts, energetic transitions, hashtag overlay\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
}


def get_template_from_db(template_key: str) -> dict | None:
    """Get template from database. Returns None if not found or DB unavailable."""
    try:
        from app.database import SessionLocal
        from app.models.template import VideoTemplate

        db = SessionLocal()
        try:
            template = db.query(VideoTemplate).filter(
                VideoTemplate.key == template_key,
                VideoTemplate.is_active == True
            ).first()

            if template:
                return {
                    "name": template.name,
                    "structure": template.structure,
                }
            return None
        finally:
            db.close()
    except Exception as e:
        logger.warning("Failed to load template from database: %s", e)
        return None


def get_template(template_key: str) -> dict:
    """Get template from database with fallback to hardcoded templates."""
    # Try database first
    db_template = get_template_from_db(template_key)
    if db_template:
        return db_template

    # Fallback to hardcoded templates
    return TEMPLATES.get(template_key, TEMPLATES["grwm"])

def get_hook_templates_from_db() -> list[dict]:
    """Load all active hook templates from the database."""
    try:
        from app.database import SessionLocal
        from app.models.template import HookTemplate

        db = SessionLocal()
        try:
            templates = db.query(HookTemplate).filter(
                HookTemplate.is_active == True
            ).order_by(HookTemplate.created_at).all()

            result = []
            for t in templates:
                try:
                    examples = json.loads(t.examples)
                except Exception:
                    examples = [t.examples]
                result.append({
                    "key": t.key,
                    "name": t.name,
                    "description": t.description,
                    "examples": examples,
                })
            return result
        finally:
            db.close()
    except Exception as e:
        logger.warning("Failed to load hook templates from database: %s", e)
        return []


VARIANT_PROMPT = (
    "You are an expert TikTok marketing video scriptwriter for cross-border e-commerce.\n\n"
    "Target aspect ratio: {aspect_ratio}\n"
    "Video duration: {video_duration} seconds\n"
    "Image layout: {layout_instruction}\n\n"
    "Product info:\n{product_json}\n\n"
    "Template style: {template_name}\n"
    "Template structure:\n{template_structure}\n\n"
    "Hook strategy templates (use a DIFFERENT one for each variant):\n"
    "{hook_strategies}\n\n"
    "Generate exactly 10 different video prompt variants using the template above.\n"
    "Each variant MUST:\n"
    "- Be written entirely in English\n"
    "- Have a unique hook and unique content approach\n"
    "- Use a different hook strategy from the list above for each variant\n"
    "- Keep the product appearance description consistent\n"
    "- Include ALL template fields: [Equipment], [Video Style], [Video Music], [Video Effects], [Hook], [Video Content], [Product Consistency]\n"
    "- [Hook]: A short, punchy opening line based on the assigned hook strategy. Keep it concise and impactful - one sentence that stops the scroll.\n"
    "- [Video Content] rules:\n"
    "  * Total duration must equal exactly {video_duration}s\n"
    "  * CRITICAL: Total spoken dialogue/voiceover must NOT exceed {max_spoken_words} words (approx 2.5 words/sec). Keep lines short and punchy.\n"
    "  * Use flexible timestamp intervals based on content rhythm (e.g. 0-2s, 2-7s, 7-10s, 10-15s)\n"
    "  * Each segment includes: visual action, camera angle, spoken dialogue/voiceover\n"
    "  * Text overlay: MAXIMUM 2 segments can have text overlay in the entire video. Use only to highlight key product features/selling points. All other segments must have NO text overlay field.\n"
    "  * The opening segment must naturally deliver the hook line\n"
    "  * Content must flow as one continuous story from hook to CTA\n"
    "- [Product Consistency] MUST describe the exact product appearance\n\n"
    "Return a JSON array of 10 objects, each with fields: "
    '"variant_index" (1-10), "hook_key" (the exact selected hook strategy key), "hook", "content", "full_prompt".\n'
    "Return ONLY the JSON array, no other text."
)


def build_generation_prompt(
    product_doc: dict,
    template_key: str,
    aspect_ratio: str = "16:9",
    grid_layout: str = "single",
    video_duration: int = 15,
) -> str:
    """Build the prompt that asks the AI to generate 10 variants.
    Reads system_prompt from DB for real-time configurability."""
    # Try to load prompt from DB
    from app.database import SessionLocal
    from app.api.agent_prompts import get_agent_prompt
    db = SessionLocal()
    try:
        _sys, _ = get_agent_prompt(db, "video_script_generator")
    finally:
        db.close()
    prompt_template = _sys or VARIANT_PROMPT

    template = get_template(template_key)
    consistency = (
        f"Preserve the exact design, color, and appearance of {product_doc.get('title', 'the product')}: "
        f"{product_doc.get('appearance', 'as shown in reference images')}"
    )
    # Map grid_layout → ImageLayoutTemplate key (mirrors product_pipeline.py)
    GRID_TO_TEMPLATE = {
        "single": "single_keyframe", "single_keyframe": "single_keyframe",
        "story_flow_5": "story_flow_5", "industrial_macro_5": "industrial_macro_5",
        "3x2": "storyboard_6panel", "2x3": "storyboard_6panel",
        "3x3": "storyboard_9panel", "3x4": "storyboard_12panel_3x4",
        "4x3": "storyboard_12panel_4x3", "4x4": "storyboard_16panel",
    }
    template_key_lookup = GRID_TO_TEMPLATE.get(grid_layout, grid_layout)

    # Read actual ImageLayoutTemplate from DB
    try:
        from app.models.template import ImageLayoutTemplate
        db2 = SessionLocal()
        try:
            layout_tmpl = db2.query(ImageLayoutTemplate).filter(
                ImageLayoutTemplate.key == template_key_lookup
            ).first()
            if layout_tmpl and layout_tmpl.prompt_template:
                layout_instruction = layout_tmpl.prompt_template
            else:
                layout_instruction = "Generate a single keyframe image"
        finally:
            db2.close()
    except Exception:
        layout_instruction = "Generate a single keyframe image"

    # Load hook templates from DB; fall back to generic list if none available
    hook_templates = get_hook_templates_from_db()
    if hook_templates:
        hook_lines = []
        for ht in hook_templates:
            examples = ht.get("examples", [])
            example_str = examples[0] if examples else ht["description"]
            hook_lines.append(
                f"- {ht['key']} ({ht['name']}): {ht['description']}\n"
                f"  Example: {example_str}"
            )
        hook_strategies = "\n".join(hook_lines)
    else:
        hook_strategies = (
            "- Pain Point Solution: open with a relatable problem\n"
            "- Tough Love: bold controversial statement\n"
            "- Product Replacement: tell viewers to ditch old product\n"
            "- Instant Curiosity: surprising unexpected result\n"
            "- Before/After Tension: contrast messy before with satisfying after\n"
            "- Social Proof: reference widespread popularity\n"
            "- Smart Shortcut: time-saving hack angle\n"
            "- Direct Recommendation: confident direct pitch\n"
            "- Problem Agitation: amplify frustrating problem\n"
            "- Doing It Wrong: imply viewer has been making a mistake"
        )

    prompt = prompt_template.format(
        product_json=json.dumps(product_doc, ensure_ascii=False, indent=2),
        template_name=template["name"],
        template_structure=template["structure"].format(
            hook="{unique hook here}",
            content="{unique content here}",
            consistency=consistency,
        ),
        aspect_ratio=aspect_ratio,
        video_duration=video_duration,
        max_spoken_words=int(video_duration * 2.5),
        layout_instruction=layout_instruction,
        hook_strategies=hook_strategies,
    )
    if '"hook_key"' not in prompt:
        prompt += (
            "\n\nOutput contract: every JSON object MUST include "
            '"hook_key" with the exact selected hook strategy key from the hook strategy templates.'
        )
    return prompt


def generate_prompt_variants(
    product_doc: dict,
    template_key: str,
    analysis_model: AIModel,
    video_duration: int = 15,
    total_variants: int = 10,
    grid_layout: str = "single",
) -> list[dict]:
    """Generate prompt variants using the analysis model, in batches to avoid truncation."""
    all_variants = []
    batch_size = 3
    batches = (total_variants + batch_size - 1) // batch_size

    for batch_idx in range(batches):
        remaining = total_variants - len(all_variants)
        count = min(batch_size, remaining)
        start_index = batch_idx * batch_size + 1

        prompt = build_generation_prompt(product_doc, template_key, video_duration=video_duration, grid_layout=grid_layout)
        # Override the "Generate exactly 10" instruction with batch-specific count
        prompt = prompt.replace(
            "Generate exactly 10 different video prompt variants",
            f"Generate exactly {count} different video prompt variants (variant_index {start_index} to {start_index + count - 1})"
        )
        prompt = prompt.replace(
            "Return a JSON array of 10 objects",
            f"Return a JSON array of {count} objects"
        )

        logger.info("Generating batch %d/%d (%d variants), prompt length: %d", batch_idx + 1, batches, count, len(prompt))
        raw = analysis_model.analyze_text(prompt, task="direct")
        logger.info("Batch %d raw response length: %d", batch_idx + 1, len(raw) if raw else 0)

        if not raw or not raw.strip():
            logger.error("Batch %d returned empty response", batch_idx + 1)
            continue

        parsed = analysis_model._parse_json_safe(raw)

        if isinstance(parsed, list) and len(parsed) > 0:
            # Fix variant_index to be sequential
            for i, v in enumerate(parsed):
                v["variant_index"] = start_index + i
            all_variants.extend(parsed)
            logger.info("Batch %d: got %d variants (total: %d)", batch_idx + 1, len(parsed), len(all_variants))
        else:
            logger.warning("Batch %d failed to parse, got %s", batch_idx + 1, type(parsed).__name__)

    if not all_variants:
        raise RuntimeError("All batches failed to generate valid prompts.")

    return all_variants
