"""Product image recognition (3-layer) and document generation."""
import json
import logging
from pathlib import Path

from app.ai_models.base import AIModel

logger = logging.getLogger(__name__)

PRODUCT_IMAGE_PROMPT = (
    "Analyze this product image and return a JSON object with exactly these 3 fields:\n"
    '{"basic_recognition":"Describe what you see: the object, colors, materials, background scene",'
    '"product_understanding":"Product details: appearance features, selling points, target audience, use cases",'
    '"creative_usage":"TikTok video suggestions: what type of shot this suits (unboxing/detail close-up/lifestyle/comparison), recommended camera angle and lighting"}'
    "\nAll descriptions must be in English. Return ONLY the JSON, no other text."
)

PRODUCT_DOC_PROMPT = (
    "Based on the following product information and image analysis results, "
    "generate a structured product document in JSON format with these exact fields:\n"
    '{{"title":"Product title in English",'
    '"description":"1-2 sentence product description in English",'
    '"appearance":"Detailed appearance description in English (color, shape, material, size)",'
    '"usage":"Primary use cases in English",'
    '"selling_points":"Key selling points in English (comma-separated)"}}\n\n'
    "Product info:\nTitle: {title}\nDescription: {description}\n\n"
    "Image analysis results:\n{image_results}\n\n"
    "Return ONLY the JSON, no other text."
)


def analyze_product_images(
    image_paths: list[str],
    vision_model: AIModel,
) -> list[dict]:
    """Run 3-layer AI recognition on each product image."""
    results = []
    for path in image_paths:
        try:
            if vision_model.SUPPORTS_VISION:
                # Use vision model to analyze the image
                frame_results = vision_model.analyze_frames([path])
                # Now do a text analysis with the 3-layer prompt
                context = json.dumps(frame_results[0] if frame_results else {}, ensure_ascii=False)
                raw = vision_model.analyze_text(
                    f"Based on this image analysis: {context}\n\n{PRODUCT_IMAGE_PROMPT}",
                    task="direct",
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
            })
        except Exception as e:
            logger.warning("Image analysis failed for %s: %s", path, e)
            results.append({
                "index": len(results) + 1,
                "filename": Path(path).name,
                "path": path,
                "basic_recognition": f"Analysis failed: {e}",
                "product_understanding": "",
                "creative_usage": "",
            })

    # Filter out irrelevant images based on AI analysis
    filtered = _filter_relevant_images(results, vision_model)
    logger.info("Filtered %d/%d images as product-relevant", len(filtered), len(results))
    return filtered


def _filter_relevant_images(results: list[dict], vision_model: AIModel) -> list[dict]:
    """Filter out images that are not product-related (logos, decorations, ads, etc.)."""
    if len(results) <= 3:
        # Keep all if we have 3 or fewer images
        return results

    # Ask AI to identify which images are product-related
    filter_prompt = (
        "Review these product image analysis results and identify which images show the actual product "
        "(not website logos, decorative elements, advertisements, or unrelated content).\n\n"
        "Image analysis results:\n"
    )
    for r in results:
        filter_prompt += (
            f"Image {r['index']} ({r['filename']}): "
            f"Basic: {r['basic_recognition'][:100]} | "
            f"Product: {r['product_understanding'][:100]}\n"
        )

    filter_prompt += (
        "\n\nReturn a JSON array of image indices (numbers) that show the actual product. "
        "Example: [1, 3, 5, 7]\n"
        "Return ONLY the JSON array, no other text."
    )

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
        f"Creative: {r['creative_usage']}"
        for r in image_results
    )
    prompt = PRODUCT_DOC_PROMPT.format(
        title=title, description=description, image_results=image_text
    )
    raw = analysis_model.analyze_text(prompt, task="direct")
    parsed = analysis_model._parse_json_safe(raw) if isinstance(raw, str) else raw
    if not isinstance(parsed, dict) or not parsed:
        parsed = {"title": title, "description": description, "appearance": "", "usage": "", "selling_points": ""}
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
        "## Basic Info",
        f"- **Appearance**: {product_info.get('appearance', '')}",
        f"- **Usage**: {product_info.get('usage', '')}",
        f"- **Selling Points**: {product_info.get('selling_points', '')}",
        "",
        "## Description",
        product_info.get("description", ""),
        "",
        "## Image Analysis Results",
        "",
    ]
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
