"""Product image recognition (3-layer) and document generation."""
import json
import logging
from pathlib import Path

from app.ai_models.base import AIModel

logger = logging.getLogger(__name__)


def _call_with_retry(fn, max_retries: int = 3, base_wait: int = 10):
    """Call fn with exponential backoff retry on 429 errors."""
    import time
    for attempt in range(max_retries + 1):
        try:
            result = fn()
            # Small delay between successful calls to avoid hitting rate limits
            time.sleep(3)
            return result
        except Exception as e:
            if "429" in str(e) and attempt < max_retries:
                wait = base_wait * (2 ** attempt)  # 10s, 20s, 40s
                logger.warning("Rate limited (429), waiting %ds before retry %d/%d", wait, attempt + 1, max_retries)
                time.sleep(wait)
            else:
                raise

_PRODUCT_IMAGE_PROMPT_FALLBACK = (
    "Analyze this product image and return a JSON object with exactly these fields:\n"
    '{"basic_recognition":"Describe what you see: the object, colors, materials, background scene",'
    '"product_understanding":"Product details: appearance features, selling points, target audience, use cases",'
    '"creative_usage":"TikTok video suggestions: what type of shot this suits (unboxing/detail close-up/lifestyle/comparison), recommended camera angle and lighting",'
    '"focus_subject":"What the image is mainly showing in relation to the target product",'
    '"relevance":"primary_product|packaging_or_infographic|usage_scene|comparison|unrelated_or_ambiguous",'
    '"context_alignment":"Explain whether the visual evidence matches the provided product page context"}'
    "\nAll descriptions must be in English. Return ONLY the JSON, no other text."
)

# Keep the old name as an alias so any existing callers still work
PRODUCT_IMAGE_PROMPT = _PRODUCT_IMAGE_PROMPT_FALLBACK


def _get_product_image_prompt(db=None) -> str:
    """Return the product_image_analyzer system_prompt from DB, falling back to the hardcoded default."""
    if db is not None:
        try:
            from app.api.agent_prompts import get_agent_prompt
            system_prompt, _ = get_agent_prompt(db, "product_image_analyzer")
            if system_prompt:
                return system_prompt
        except Exception as e:
            logger.warning("Could not load product_image_analyzer prompt from DB: %s", e)
    return _PRODUCT_IMAGE_PROMPT_FALLBACK


def _format_product_context(title: str = "", description: str = "") -> str:
    return (
        "Product page context (treat this as the source of truth when interpreting images):\n"
        f"- Title: {title or 'Unknown'}\n"
        f"- Page description: {description or 'No page description'}\n"
        "Rules:\n"
        "- Identify the TARGET PRODUCT from the title and page description first.\n"
        "- If an image contains a phone, app screen, hand, room, packaging text, comparison chart, or lifestyle prop, "
        "do not classify that prop as the product unless the page context says it is the product.\n"
        "- If the raw visual caption conflicts with the product page context, correct it and explain the correction in context_alignment.\n"
        "- For infographic or usage images, describe the product information shown and keep the target product as the focus.\n"
    )

PRODUCT_DOC_PROMPT = (
    "Based on the following product information and image analysis results, "
    "generate a structured product document in JSON format with these exact fields:\n"
    '{{"title":"Product title in English",'
    '"description":"1-2 sentence product description in English",'
    '"source_content":{"web_title":"Original product page title","web_description":"Original product page description"},'
    '"appearance":"Detailed appearance description in English (color, shape, material, size, all visible parts labeled)",'
    '"category":"Product category (beauty/digital device/clothing/perfume/stationery/home/fitness/other)",'
    '"target_users":"Who this product is for",'
    '"usage_scenarios":"Where and when to use this product",'
    '"usage":"Primary use cases in English",'
    '"usage_steps":["Step 1: action","Step 2: action","Step 3: action","Step 4: action"],'
    '"preparation":["Prep 1: what to do before using","Prep 2: ..."],'
    '"tips":["Tip 1: best practice","Tip 2: ...","Tip 3: ..."],'
    '"warnings":["Warning 1: what to avoid","Warning 2: ..."],'
    '"key_parts":["Part name: function","Part name: function"],'
    '"image_evidence":["Image 1: useful product evidence","Image 2: useful product evidence"],'
    '"selling_points":"Key selling points in English (comma-separated)"}}\n\n'
    "IMPORTANT SOURCE PRIORITY: First extract the product identity and claims from the webpage title and description. "
    "Then use image recognition results as supporting evidence. If an image appears to show phones, rooms, charts, packaging, "
    "or other props, keep the webpage product as the primary product and treat those elements as context unless clearly unrelated. "
    "IMPORTANT: For usage_steps, provide 4-8 concrete steps in correct real-world order. "
    "For key_parts, identify all visible/important physical parts from the images. "
    "For warnings, think about common user mistakes.\n\n"
    "Product info:\nTitle: {title}\nDescription: {description}\n\n"
    "Image analysis results:\n{image_results}\n\n"
    "Return ONLY the JSON, no other text."
)


def analyze_product_images(
    image_paths: list[str],
    vision_model: AIModel,
    product_title: str = "",
    product_description: str = "",
    db=None,
    progress_callback=None,
) -> list[dict]:
    """Run 3-layer AI recognition on each product image."""
    import time

    image_prompt = _get_product_image_prompt(db)
    product_context = _format_product_context(product_title, product_description)
    total_images = len(image_paths)
    if progress_callback:
        progress_callback(0, total_images, "准备识别图片")

    results = []
    for path in image_paths:
        try:
            if vision_model.SUPPORTS_VISION:
                # Use vision model with retry on 429
                frame_results = _call_with_retry(
                    lambda: vision_model.analyze_frames([path])
                )
                context = json.dumps(frame_results[0] if frame_results else {}, ensure_ascii=False)
                raw = _call_with_retry(
                    lambda ctx=context: vision_model.analyze_text(
                        f"{product_context}\n\nRaw visual analysis for this single image:\n{ctx}\n\n{image_prompt}",
                        task="direct",
                    )
                )
            else:
                raw = "{}"

            parsed = vision_model._parse_json_safe(raw) if isinstance(raw, str) else raw
            results.append({
                "index": len(results) + 1,
                "filename": Path(path).name,
                "path": path,
                "basic_recognition": parsed.get("basic_recognition", ""),
                "product_understanding": parsed.get("product_understanding", ""),
                "creative_usage": parsed.get("creative_usage", ""),
                "focus_subject": parsed.get("focus_subject", ""),
                "relevance": parsed.get("relevance", ""),
                "context_alignment": parsed.get("context_alignment", ""),
            })
            if progress_callback:
                progress_callback(len(results), total_images, "识别图片")
            # Rate limit: wait 5s before next image
            time.sleep(5)
        except Exception as e:
            logger.warning("Image analysis failed for %s: %s", path, e)
            results.append({
                "index": len(results) + 1,
                "filename": Path(path).name,
                "path": path,
                "basic_recognition": f"Analysis failed: {e}",
                "product_understanding": "",
                "creative_usage": "",
                "focus_subject": "",
                "relevance": "unrelated_or_ambiguous",
                "context_alignment": "",
            })
            if progress_callback:
                progress_callback(len(results), total_images, "识别图片")

    # Filter out irrelevant images based on AI analysis
    if progress_callback:
        progress_callback(len(results), total_images, "筛选有效图片")
    filtered = _filter_relevant_images(results, vision_model, product_title, product_description)
    logger.info("Filtered %d/%d images as product-relevant", len(filtered), len(results))
    return filtered


def _filter_relevant_images(
    results: list[dict],
    vision_model: AIModel,
    product_title: str = "",
    product_description: str = "",
) -> list[dict]:
    """Filter out images that are not product-related (logos, decorations, ads, etc.)."""
    if len(results) <= 3:
        # Keep all if we have 3 or fewer images
        return results

    # Build image analysis text for the prompt
    image_analysis_lines = ""
    for r in results:
        image_analysis_lines += (
            f"Image {r['index']} ({r['filename']}): "
            f"Basic: {r['basic_recognition'][:100]} | "
            f"Product: {r['product_understanding'][:100]} | "
            f"Focus: {r.get('focus_subject', '')[:80]} | "
            f"Relevance: {r.get('relevance', '')}\n"
        )

    # Try to load prompt template from DB; fallback to hardcoded default
    _DEFAULT_FILTER_PROMPT = (
        "Review these product image analysis results and identify which images show the actual product "
        "or product-relevant packaging, infographics, comparisons, and usage scenes. "
        "Do not keep images whose main subject is a different product than the page context.\n\n"
        "{product_context}\n"
        "Image analysis results:\n"
        "{image_analysis_results}"
        "\n\nReturn a JSON array of image indices (numbers) that show the actual product. "
        "Example: [1, 3, 5, 7]\n"
        "Return ONLY the JSON array, no other text."
    )
    from app.database import SessionLocal
    from app.api.agent_prompts import get_agent_prompt
    db_ap = SessionLocal()
    try:
        _sys, _ = get_agent_prompt(db_ap, "image_filter")
        prompt_template = _sys if _sys else _DEFAULT_FILTER_PROMPT
    finally:
        db_ap.close()

    product_context = _format_product_context(product_title, product_description)
    try:
        filter_prompt = prompt_template.format(
            product_context=product_context,
            image_analysis_results=image_analysis_lines,
        )
    except KeyError:
        filter_prompt = product_context + "\n\n" + prompt_template.format(image_analysis_results=image_analysis_lines)

    try:
        raw = vision_model.analyze_text(filter_prompt, task="direct")
        relevant_indices = vision_model._parse_json_safe(raw) if isinstance(raw, str) else raw

        if isinstance(relevant_indices, list) and relevant_indices:
            # Keep only images with indices in the relevant list
            filtered = [r for r in results if r['index'] in relevant_indices]
            if filtered:
                # Re-index after filtering
                for i, r in enumerate(filtered, 1):
                    r['index'] = i
                return filtered
    except Exception as e:
        logger.warning("Image filtering failed: %s, keeping all images", e)

    # Fallback: keep all images if filtering fails
    return results


def generate_product_doc(
    title: str,
    description: str,
    image_results: list[dict],
    analysis_model: AIModel,
) -> dict:
    """Generate structured product document using analysis model."""
    image_text = "\n".join(
        f"Image {r['index']} ({r['filename']}): "
        f"Basic: {r['basic_recognition']} | "
        f"Product: {r['product_understanding']} | "
        f"Creative: {r['creative_usage']} | "
        f"Focus: {r.get('focus_subject', '')} | "
        f"Relevance: {r.get('relevance', '')} | "
        f"Alignment: {r.get('context_alignment', '')}"
        for r in image_results
    )

    source_priority = (
        "Source priority rules:\n"
        f"1. Webpage title is the primary product identity: {title}\n"
        f"2. Webpage description is the primary marketing copy: {description}\n"
        "3. Image analysis is supporting evidence. Correct any image-level misclassification that conflicts with the webpage identity.\n"
    )

    # Read agent prompt from DB (real-time, no cache)
    from app.database import SessionLocal
    from app.api.agent_prompts import get_agent_prompt
    db_ap = SessionLocal()
    try:
        _sys, _usr_tmpl = get_agent_prompt(db_ap, "product_doc_generator")
    finally:
        db_ap.close()

    if _sys and _usr_tmpl:
        prompt = (
            _sys
            + "\n\n"
            + source_priority
            + "\n"
            + _usr_tmpl.format(title=title, description=description, image_results=image_text)
        )
    else:
        prompt = PRODUCT_DOC_PROMPT.format(
            title=title, description=description, image_results=image_text
        )
    raw = analysis_model.analyze_text(prompt, task="direct")
    parsed = analysis_model._parse_json_safe(raw) if isinstance(raw, str) else raw
    if not isinstance(parsed, dict) or not parsed:
        parsed = {"title": title, "description": description, "appearance": "", "usage": "", "selling_points": ""}
    parsed.setdefault("title", title)
    parsed.setdefault("description", description)
    parsed.setdefault("appearance", "")
    parsed.setdefault("usage", "")
    parsed.setdefault("selling_points", "")
    parsed["source_content"] = {
        "web_title": title,
        "web_description": description,
    }
    parsed.setdefault(
        "image_evidence",
        [
            f"Image {r['index']}: {r.get('product_understanding') or r.get('basic_recognition')}"
            for r in image_results[:5]
            if r.get("product_understanding") or r.get("basic_recognition")
        ],
    )
    return parsed


def write_product_docs(
    product_dir: str,
    product_info: dict,
    image_results: list[dict],
) -> tuple[str, str]:
    """Write Markdown and JSON product documents. Returns (md_path, json_path)."""
    out = Path(product_dir)
    out.mkdir(parents=True, exist_ok=True)

    # JSON doc
    json_doc = {**product_info, "images": image_results}
    json_path = out / "product_doc.json"
    json_path.write_text(json.dumps(json_doc, ensure_ascii=False, indent=2), encoding="utf-8")

    # Markdown doc
    md_lines = [
        f"# {product_info.get('title', 'Unknown Product')}",
        "",
        "## Web Source",
        f"- **Title**: {product_info.get('source_content', {}).get('web_title', product_info.get('title', ''))}",
        f"- **Description**: {product_info.get('source_content', {}).get('web_description', product_info.get('description', ''))}",
        "",
        "## Basic Info",
        f"- **Appearance**: {product_info.get('appearance', '')}",
        f"- **Usage**: {product_info.get('usage', '')}",
        f"- **Selling Points**: {product_info.get('selling_points', '')}",
        f"- **Category**: {product_info.get('category', '')}",
        f"- **Target Users**: {product_info.get('target_users', '')}",
        "",
        "## Description",
        product_info.get("description", ""),
        "",
        "## Product Evidence",
        "",
    ]
    for item in product_info.get("image_evidence", []) or []:
        md_lines.append(f"- {item}")
    md_lines.extend([
        "",
        "## Image Analysis Results",
        "",
    ])
    for r in image_results:
        md_lines.extend([
            f"### Image {r['index']} ({r['filename']})",
            f"- **Basic Recognition**: {r['basic_recognition']}",
            f"- **Product Understanding**: {r['product_understanding']}",
            f"- **Creative Usage**: {r['creative_usage']}",
            "",
        ])

    md_path = out / "product_doc.md"
    md_path.write_text("\n".join(md_lines), encoding="utf-8")

    return str(md_path), str(json_path)
