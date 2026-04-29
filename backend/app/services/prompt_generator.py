"""Template-based marketing video prompt generator."""
import json
import logging

from app.ai_models.base import AIModel

logger = logging.getLogger(__name__)

TEMPLATES = {
    "grwm": {
        "name": "TikTok GRWM",
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
        "name": "Unboxing Review",
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
    "comparison": {
        "name": "Comparison Test",
        "structure": (
            "[Equipment] Shot with iPhone rear camera, tripod\n"
            "[Video Style] TikTok side-by-side comparison, fast-paced\n"
            "[Video Music] Energetic electronic beat\n"
            "[Video Effects] Split screen, before/after, text overlay with stats\n"
            "[First 3 Seconds Hook] {hook}\n"
            "[Video Content] {content}\n"
            "[Product Consistency] {consistency}"
        ),
    },
}

VARIANT_PROMPT = (
    "You are an expert TikTok marketing video scriptwriter for cross-border e-commerce.\n\n"
    "Product info:\n{product_json}\n\n"
    "Template style: {template_name}\n"
    "Template structure:\n{template_structure}\n\n"
    "Generate exactly 10 different video prompt variants using the template above.\n"
    "Each variant MUST:\n"
    "- Be written entirely in English\n"
    "- Have a unique hook (first 3 seconds) and unique content approach\n"
    "- Keep the product appearance description consistent\n"
    "- Include all template fields\n\n"
    "Hook variation ideas: surprise unboxing, before/after comparison, "
    "problem-solution, direct showcase, challenge/dare, storytelling, "
    "POV style, duet reaction, tutorial, day-in-life.\n\n"
    "Return a JSON array of 10 objects, each with fields: "
    '"variant_index" (1-10), "hook", "content", "full_prompt".\n'
    "Return ONLY the JSON array, no other text."
)


def build_generation_prompt(product_doc: dict, template_key: str) -> str:
    """Build the prompt that asks the AI to generate 10 variants."""
    template = TEMPLATES.get(template_key, TEMPLATES["grwm"])
    consistency = (
        f"Preserve the exact design, color, and appearance of {product_doc.get('title', 'the product')}: "
        f"{product_doc.get('appearance', 'as shown in reference images')}"
    )
    return VARIANT_PROMPT.format(
        product_json=json.dumps(product_doc, ensure_ascii=False, indent=2),
        template_name=template["name"],
        template_structure=template["structure"].format(
            hook="{unique hook here}",
            content="{unique content here}",
            consistency=consistency,
        ),
    )


def generate_prompt_variants(
    product_doc: dict,
    template_key: str,
    analysis_model: AIModel,
) -> list[dict]:
    """Generate 10 prompt variants using the analysis model."""
    prompt = build_generation_prompt(product_doc, template_key)
    logger.info("Generating prompt variants, prompt length: %d", len(prompt))
    raw = analysis_model.analyze_text(prompt, task="direct")
    logger.info("Prompt generation raw response length: %d, preview: %s", len(raw) if raw else 0, repr(raw[:300]) if raw else "empty")
    parsed = analysis_model._parse_json_safe(raw)

    if isinstance(parsed, list) and len(parsed) > 0:
        return parsed

    logger.error("Prompt generation failed to return a valid list. Parsed type: %s, raw preview: %s", type(parsed).__name__, raw[:500] if raw else "empty")
    raise RuntimeError(f"Prompt generation returned {type(parsed).__name__} instead of list. AI response may be malformed.")
