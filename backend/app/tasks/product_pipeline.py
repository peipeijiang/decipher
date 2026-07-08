"""Background pipeline: scrape → analyze → generate prompts."""
import logging
import subprocess
from pathlib import Path
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.product import Product
from app.models.product_prompt import ProductPrompt
from app.models.config import ModelConfig

logger = logging.getLogger(__name__)

# In-memory progress: product_id → {scrape, doc, prompts, error, doc_current, doc_total, doc_stage}
_progress: dict[str, dict] = {}


def get_product_progress(product_id: str) -> dict:
    return _progress.get(product_id, {
        "scrape": 0,
        "doc": 0,
        "prompts": 0,
        "error": None,
        "doc_current": 0,
        "doc_total": 0,
        "doc_stage": "",
    })


def _set_progress(product_id: str, error: str | None = None, **kwargs) -> None:
    if product_id not in _progress:
        _progress[product_id] = {
            "scrape": 0,
            "doc": 0,
            "prompts": 0,
            "error": None,
            "doc_current": 0,
            "doc_total": 0,
            "doc_stage": "",
        }
    _progress[product_id].update(kwargs)
    if error is not None:
        _progress[product_id]["error"] = error


def _make_doc_progress_callback(product_id: str, base: int = 10, span: int = 50):
    def _callback(current: int, total: int, stage: str = "识别图片") -> None:
        if total <= 0:
            _set_progress(product_id, doc=base, doc_current=0, doc_total=0, doc_stage=stage)
            return
        doc_progress = min(base + span, base + int((current / total) * span))
        _set_progress(
            product_id,
            doc=doc_progress,
            doc_current=current,
            doc_total=total,
            doc_stage=stage,
        )

    return _callback


def _provider_configured(cfg: ModelConfig, provider: str) -> bool:
    try:
        providers = cfg.get_providers()
        return bool((providers.get(provider) or {}).get("api_key"))
    except Exception:
        return False


def _image_results_need_fallback(image_results: list[dict]) -> bool:
    if not image_results:
        return True

    useful_count = 0
    for result in image_results:
        fields = [
            result.get("basic_recognition", ""),
            result.get("product_understanding", ""),
            result.get("focus_subject", ""),
            result.get("context_alignment", ""),
        ]
        combined = " ".join(str(field) for field in fields if field).strip()
        if (
            combined
            and "analysis failed" not in combined.lower()
            and result.get("relevance") != "unrelated_or_ambiguous"
        ):
            useful_count += 1

    return useful_count == 0


def _analyze_images_with_vision_fallback(
    image_paths: list[str],
    cfg: ModelConfig,
    vision_model,
    product: Product,
    db: Session,
    product_id: str,
):
    from app.ai_models import get_model
    from app.services.product_analyzer import analyze_product_images

    image_results = analyze_product_images(
        image_paths,
        vision_model,
        product_title=product.title,
        product_description=product.description,
        db=db,
        progress_callback=_make_doc_progress_callback(product_id),
    )

    if (
        cfg.vision_model != "zhipu"
        and _image_results_need_fallback(image_results)
        and _provider_configured(cfg, "zhipu")
    ):
        logger.warning(
            "Vision model %s produced no usable product image analysis for %s; retrying with zhipu",
            cfg.vision_model,
            product_id,
        )
        _set_progress(product_id, doc=10, doc_stage="视觉模型降级重试")
        fallback_model = get_model("zhipu", cfg)
        image_results = analyze_product_images(
            image_paths,
            fallback_model,
            product_title=product.title,
            product_description=product.description,
            db=db,
            progress_callback=_make_doc_progress_callback(product_id),
        )

    return image_results


def resume_product_pipeline(product_id: str, start_from: str = "scrape"):
    """Resume pipeline from a specific stage."""
    db: Session = SessionLocal()
    try:
        product = db.get(Product, product_id)
        if not product:
            return

        _set_progress(product_id, error=None)
        products_base = getattr(settings, 'products_dir', 'products')
        product_dir = Path(products_base) / product_id

        if start_from == "scrape":
            # Run full pipeline
            run_product_pipeline(product_id)
            return

        from app.ai_models import get_model
        from app.services.product_analyzer import analyze_product_images, generate_product_doc, write_product_docs
        from app.services.prompt_generator import generate_prompt_variants

        cfg = db.query(ModelConfig).first() or ModelConfig()

        if start_from == "doc":
            # Skip scrape, start from image analysis
            product.status = "analyzing"
            db.commit()
            _set_progress(product_id, scrape=100, doc=10)

            vision_model = get_model(cfg.vision_model, cfg)
            analysis_model = get_model(cfg.analysis_model, cfg)

            images_dir = Path(product.images_dir)
            image_paths = sorted(str(p) for p in images_dir.glob("image_*")) if images_dir.exists() else []

            image_results = _analyze_images_with_vision_fallback(
                image_paths,
                cfg,
                vision_model,
                product,
                db=db,
                product_id=product_id,
            )
            _set_progress(product_id, doc=65, doc_stage="生成文档摘要")

            product_info = generate_product_doc(product.title, product.description, image_results, analysis_model)
            md_path, json_path = write_product_docs(str(product_dir), product_info, image_results)
            product.doc_path = md_path
            product.doc_json_path = json_path
            db.commit()
            _set_progress(product_id, doc=100, doc_stage="文档已生成")

            # Continue to prompts
            _set_progress(product_id, prompts=10)
            variants = generate_prompt_variants(product_info, "grwm", analysis_model)
            for v in variants:
                pp = ProductPrompt(
                    product_id=product_id,
                    template_name="grwm",
                    variant_index=v.get("variant_index", 0),
                    prompt_text=v.get("full_prompt", ""),
                )
                db.add(pp)
            db.commit()
            _set_progress(product_id, prompts=100)

        elif start_from == "prompts":
            # Skip scrape and doc, just generate prompts
            product.status = "analyzing"
            db.commit()
            _set_progress(product_id, scrape=100, doc=100, prompts=10)

            analysis_model = get_model(cfg.analysis_model, cfg)

            # Load existing product doc
            import json as json_mod
            doc_path = Path(product.doc_json_path)
            if not doc_path.exists():
                raise RuntimeError("Product doc not found, please rerun from beginning")
            product_info = json_mod.loads(doc_path.read_text(encoding="utf-8"))

            # Delete old prompts
            db.query(ProductPrompt).filter(ProductPrompt.product_id == product_id).delete()
            db.commit()

            variants = generate_prompt_variants(product_info, "grwm", analysis_model)
            for v in variants:
                pp = ProductPrompt(
                    product_id=product_id,
                    template_name="grwm",
                    variant_index=v.get("variant_index", 0),
                    prompt_text=v.get("full_prompt", ""),
                )
                db.add(pp)
            db.commit()
            _set_progress(product_id, prompts=100)

        product.status = "completed"
        db.commit()

    except Exception as e:
        logger.exception("Resume pipeline failed for %s: %s", product_id, e)
        try:
            product = db.get(Product, product_id)
            if product:
                product.status = "failed"
                product.error_message = str(e)
                db.commit()
        except Exception:
            pass
        _set_progress(product_id, error=str(e))
    finally:
        db.close()


def run_product_pipeline(product_id: str):
    """Phase 1 pipeline: scrape → analyze images → generate doc → generate instruction board → stop."""
    db: Session = SessionLocal()
    try:
        product = db.get(Product, product_id)
        if not product:
            return

        product.status = "scraping"
        db.commit()
        _set_progress(product_id, scrape=0, doc=0, prompts=0, error=None)

        # Ensure products directory exists
        products_base = getattr(settings, 'products_dir', 'products')
        product_dir = Path(products_base) / product_id
        product_dir.mkdir(parents=True, exist_ok=True)

        # Step 1: Scrape product page
        from app.services.scraper import ScraperService
        scraper = ScraperService(products_dir=products_base)
        scrape_result = scraper.scrape_product_page(product.url, product_id)

        product.title = scrape_result["title"]
        product.description = scrape_result["description"]
        product.images_dir = scrape_result["images_dir"]
        db.commit()
        _set_progress(product_id, scrape=100)

        if not scrape_result["images"]:
            raise RuntimeError("No product images found on the page")

        # Step 2: AI image analysis (3-layer)
        product.status = "analyzing"
        db.commit()
        _set_progress(product_id, doc=10)

        from app.ai_models import get_model
        from app.services.product_analyzer import (
            analyze_product_images, generate_product_doc, write_product_docs,
        )

        cfg = db.query(ModelConfig).first() or ModelConfig()
        vision_model = get_model(cfg.vision_model, cfg)
        analysis_model = get_model(cfg.analysis_model, cfg)

        image_paths = [img["path"] for img in scrape_result["images"]]
        # Allow up to 20 images for analysis (rate limiting handled in analyze_product_images)
        if len(image_paths) > 20:
            logger.info("Limiting image analysis from %d to 20 images", len(image_paths))
            image_paths = image_paths[:20]
        image_results = _analyze_images_with_vision_fallback(
            image_paths,
            cfg,
            vision_model,
            product,
            db=db,
            product_id=product_id,
        )
        _set_progress(product_id, doc=65, doc_stage="生成文档摘要")

        # Step 3: Generate product document
        product_info = generate_product_doc(
            product.title, product.description, image_results, analysis_model,
        )
        md_path, json_path = write_product_docs(str(product_dir), product_info, image_results)
        product.doc_path = md_path
        product.doc_json_path = json_path
        db.commit()
        _set_progress(product_id, doc=100, doc_stage="文档已生成")

        # Step 4: Generate instruction board (auto-trigger)
        logger.info("Auto-triggering instruction board generation for product %s", product_id)
        product.instruction_board_status = "generating"
        db.commit()

        # Import and call the instruction board generation function
        from app.api.products import _generate_instruction_board
        import threading
        threading.Thread(target=_generate_instruction_board, args=(product_id,), daemon=True).start()

        # Phase 1 complete - stop here and wait for user to select template
        product.status = "completed"
        db.commit()
        logger.info("Phase 1 pipeline completed for product %s. Waiting for user to select template.", product_id)

    except Exception as e:
        logger.exception("Product pipeline failed for %s: %s", product_id, e)
        try:
            product = db.get(Product, product_id)
            if product:
                product.status = "failed"
                product.error_message = str(e)
                db.commit()
        except Exception:
            pass
        _set_progress(product_id, error=str(e))
    finally:
        db.close()


def generate_image_for_prompt(prompt_id: str):
    """Generate a keyframe image for a single prompt."""
    db: Session = SessionLocal()
    try:
        pp = db.get(ProductPrompt, prompt_id)
        if not pp:
            return
        product = db.get(Product, pp.product_id)
        if not product:
            return

        # Check if task was cancelled before starting
        db.refresh(pp)
        if pp.image_status != "generating":
            return

        from app.services.image_generator import ImageGeneratorService

        # Read from DB config_json first, fallback to .env settings
        cfg = db.query(ModelConfig).first()
        providers = cfg.get_providers() if cfg else {}

        # Get selected image model from config
        image_model = cfg.image_model if cfg else "gpt-image-2-vip"

        # Determine API key based on image model
        if image_model == "qwen-image-2.0-pro":
            api_key = providers.get("_aliyun_api_key") or providers.get("aliyun", {}).get("api_key", "")
            if not api_key:
                raise RuntimeError("aliyun_api_key not configured")
        elif image_model == "updrama-image-2":
            api_key = providers.get("_updrama_api_key") or ""
            if not api_key:
                raise RuntimeError("updrama_api_key not configured")
        else:
            api_key = providers.get("_laozhang_api_key") or getattr(settings, 'laozhang_api_key', '')
            if not api_key:
                raise RuntimeError("laozhang_api_key not configured")

        # Generate a concise image prompt from the video script using AI
        image_prompt = pp.image_prompt
        grid = pp.grid_layout or "single"

        # Map grid values to ImageLayoutTemplate keys
        GRID_TO_TEMPLATE = {
            "single": "single_keyframe", "story_flow_5": "story_flow_5", "industrial_macro_5": "industrial_macro_5",
            "3x2": "storyboard_6panel", "2x3": "storyboard_6panel",
            "3x3": "storyboard_9panel", "3x4": "storyboard_12panel_3x4",
            "4x3": "storyboard_12panel_4x3", "4x4": "storyboard_16panel",
        }
        template_key = GRID_TO_TEMPLATE.get(grid, grid)
        GRID_TO_GENERATOR = {
            "single_keyframe": "single", "single": "single",
            "storyboard_6panel": "3x2", "storyboard_9panel": "3x3",
            "storyboard_12panel_3x4": "3x4", "storyboard_12panel_4x3": "4x3",
            "storyboard_16panel": "4x4", "story_flow_5": "story_flow_5",
            "industrial_macro_5": "industrial_macro_5",
        }
        generation_grid = GRID_TO_GENERATOR.get(grid, grid)

        # All grids now go through ImageLayoutTemplate lookup
        image_prompt = None

        if not image_prompt:
            try:
                from app.ai_models import get_model
                from app.api.agent_prompts import get_agent_prompt
                analysis_model = get_model(cfg.analysis_model, cfg) if cfg else None

                def _run_agent(model, system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
                    if hasattr(model, "chat"):
                        return model.chat(system_prompt, user_prompt, max_tokens=max_tokens)
                    if hasattr(model, "analyze_text"):
                        return model.analyze_text(
                            f"SYSTEM PROMPT:\n{system_prompt}\n\nUSER PROMPT:\n{user_prompt}",
                            task="direct",
                        )
                    raise RuntimeError(f"Model {type(model).__name__} does not support text generation")

                if analysis_model and (hasattr(analysis_model, 'chat') or hasattr(analysis_model, 'analyze_text')):
                    # Route the image prompt branch through the actual workflow agents.
                    from app.models.template import ImageLayoutTemplate

                    db_inner = SessionLocal()
                    try:
                        layout_tmpl = db_inner.query(ImageLayoutTemplate).filter(ImageLayoutTemplate.key == template_key).first()
                        base_prompt = layout_tmpl.prompt_template if layout_tmpl else ""
                    finally:
                        db_inner.close()

                    panel_count_by_grid = {
                        "3x2": 6, "2x3": 6, "3x3": 9,
                        "3x4": 12, "4x3": 12, "4x4": 16,
                    }
                    standard_grids = set(panel_count_by_grid)
                    story_templates = {"story_flow_5", "industrial_macro_5"}

                    if template_key == "single_keyframe" or generation_grid == "single":
                        agent_key = "single_image_prompt"
                        panel_count = 1
                        fallback_user = "Convert this video script to an image generation prompt:\n\n{prompt_text}"
                        fallback_system = (
                            "Convert the video script into one rich product image prompt. "
                            "Describe only visual scene details. Preserve the product exactly. "
                            "No subtitles, dialogue text, captions, or speech bubbles."
                        )
                    elif template_key in story_templates:
                        agent_key = "storyboard_filler"
                        panel_count = 5
                        fallback_user = "TEMPLATE:\n{base_prompt}\n\nVIDEO SCRIPT:\n{prompt_text}"
                        fallback_system = (
                            "Fill the {{placeholders}} in the template below using content from the video script. "
                            "Each panel placeholder MUST be filled with rich visual detail. "
                            "Output ONLY the filled template. English only."
                        )
                    elif generation_grid in standard_grids or template_key.startswith("storyboard_"):
                        agent_key = "multi_panel_storyboard"
                        panel_count = panel_count_by_grid.get(generation_grid, 9)
                        fallback_user = (
                            "TEMPLATE:\n{base_prompt}\n\n"
                            "GRID: {grid}\n"
                            "PANEL_COUNT: {panel_count}\n\n"
                            "VIDEO SCRIPT:\n{prompt_text}"
                        )
                        fallback_system = (
                            "Fill every panel placeholder in the image layout template using the video script. "
                            "Each panel must be a rich visual description. "
                            "Output ONLY the filled template. English only."
                        )
                    else:
                        agent_key = "video_to_image_converter"
                        panel_count = 1
                        fallback_user = "Convert this video script to an image prompt:\n\n{prompt_text}"
                        fallback_system = (
                            "Convert the video script into an image generation prompt. "
                            "Describe only visual scene details. English only."
                        )

                    _sys, _usr_tmpl = get_agent_prompt(db, agent_key)
                    agent_system = _sys or fallback_system

                    class _SafeFormatDict(dict):
                        def __missing__(self, key):
                            return "{" + key + "}"

                    format_context = _SafeFormatDict(
                        base_prompt=base_prompt,
                        prompt_text=pp.prompt_text,
                        panel_count=panel_count,
                        grid=generation_grid,
                    )
                    agent_user = (_usr_tmpl or fallback_user).format_map(format_context)

                    logger.info(
                        "Image prompt agent route: grid=%s template=%s agent=%s panel_count=%s",
                        grid, template_key, agent_key, panel_count,
                    )

                    bad_prefixes = (
                        "The user", "I need to", "Let me", "Here's", "Based on",
                        "I'll", "I will", "We need", "We must", "First,",
                        "So we", "The template",
                    )

                    image_prompt = None
                    for _attempt in range(3):
                        raw = _run_agent(analysis_model, agent_system, agent_user, max_tokens=4096).strip()
                        if not raw:
                            logger.warning("%s returned empty (attempt %d/3)", agent_key, _attempt + 1)
                            continue
                        if any(raw.startswith(p) for p in bad_prefixes):
                            marker = "STRICTLY"
                            idx = raw.find(marker)
                            if idx > 0:
                                raw = raw[idx:].strip()
                            else:
                                logger.warning("%s output reasoning (attempt %d/3)", agent_key, _attempt + 1)
                                continue
                        image_prompt = raw
                        break

                    if not image_prompt and cfg.analysis_model != "zhipu":
                        logger.warning("%s primary model failed, trying zhipu fallback", agent_key)
                        try:
                            fallback_model = get_model("zhipu", cfg)
                            raw = _run_agent(fallback_model, agent_system, agent_user, max_tokens=4096).strip()
                            if raw and not any(raw.startswith(p) for p in bad_prefixes):
                                image_prompt = raw
                                logger.info("%s zhipu fallback succeeded", agent_key)
                        except Exception as e:
                            logger.warning("%s zhipu fallback also failed: %s", agent_key, e)

                    pp.image_prompt = image_prompt
                    db.commit()
            except Exception as e:
                logger.warning("Image prompt generation failed, using truncated original: %s", e)

        # Fallback: detect video prompt format in existing image_prompt and convert
        _VIDEO_TAGS = ("[Equipment]", "[Video Style]", "[Video Effects]", "[Shot Type]",
                       "[Camera Movement]", "[Audio]", "[Transition]", "[Lighting]")
        if pp.image_prompt and any(tag in pp.image_prompt for tag in _VIDEO_TAGS):
            try:
                from app.ai_models import get_model
                analysis_model = get_model(cfg.analysis_model, cfg) if cfg else None
                def _run_agent(model, system_prompt: str, user_prompt: str, max_tokens: int = 4096) -> str:
                    if hasattr(model, "chat"):
                        return model.chat(system_prompt, user_prompt, max_tokens=max_tokens)
                    if hasattr(model, "analyze_text"):
                        return model.analyze_text(
                            f"SYSTEM PROMPT:\n{system_prompt}\n\nUSER PROMPT:\n{user_prompt}",
                            task="direct",
                        )
                    raise RuntimeError(f"Model {type(model).__name__} does not support text generation")

                if analysis_model and (hasattr(analysis_model, 'chat') or hasattr(analysis_model, 'analyze_text')):
                    logger.info("Detected video prompt format, converting to image prompt...")

                    if grid in ("3x2", "2x3", "3x3", "3x4", "4x3", "4x4"):
                        # Multi-panel storyboard
                        panel_count = {"3x2": 6, "2x3": 6, "3x3": 9, "3x4": 12, "4x3": 12, "4x4": 16}[grid]
                        converted_prompt = _run_agent(
                            analysis_model,
                            f"You are a professional storyboard artist. Given a TikTok video script, create a {panel_count}-panel storyboard image prompt. "
                            "IMPORTANT RULES:\n"
                            "1. Include the FULL original video script at the beginning for context.\n"
                            "2. After the script, add a storyboard instruction section.\n"
                            f"3. Break the video story into {panel_count} panels based on the natural story flow.\n"
                            "4. Each panel: describe only the visual scene (actor pose, camera angle, product, lighting, mood).\n"
                            "5. Preserve exact product appearance from [Product Consistency] section.\n"
                            "6. CRITICAL: Do NOT include any dialogue lines, subtitles, speech bubbles, or on-screen text in the panel descriptions. Visuals only.\n"
                            "7. Write in rich, vivid cinematic English. NO word count limit.\n\n"
                            "OUTPUT FORMAT:\n"
                            "[Original Script]\n<paste the full original script here>\n\n"
                            "[Storyboard Instruction]\n"
                            f"Create a {grid} grid of {panel_count} sequential storyboard panels based on the video story:\n"
                            + "\n".join([f"Panel {i+1}: <describe scene>" for i in range(panel_count)]) + "\n"
                            "Keep consistent character appearance across all panels. Preserve exact product design.",
                            f"Convert this video script into a {panel_count}-panel storyboard prompt:\n\n{pp.image_prompt}",
                            max_tokens=4096,
                        ).strip()
                    else:
                        # Single image: extract scene elements
                        _DEFAULT_VID2IMG_SYS = (
                            "You are an expert at converting video scripts to image generation prompts. "
                            "Extract the key visual elements (character, action, setting, lighting, composition) from the video script. "
                            "Remove all bracketed tags like [Equipment], [Video Style], etc. "
                            "Preserve product details from [Product Consistency] section. "
                            "CRITICAL: Do NOT include any dialogue lines, subtitles, captions, or on-screen text. Visual scene description only. "
                            "Overlay text allowed: maximum 1-2 short keyword phrases total, no full sentences. "
                            "Write in rich, vivid cinematic English optimized for AI image generation. NO word count limit. "
                            "Start with 'Keep the product exactly as shown, preserving all details. Only change the background and scene. No on-screen dialogue.' "
                            "No explanations, just the prompt."
                        )
                        _DEFAULT_VID2IMG_USR = "Convert this video script to an image prompt:\n\n{prompt_text}"
                        from app.api.agent_prompts import get_agent_prompt
                        _v2i_sys, _v2i_usr = get_agent_prompt(db, "video_to_image_converter")
                        _v2i_sys = _v2i_sys if _v2i_sys else _DEFAULT_VID2IMG_SYS
                        _v2i_usr_tmpl = _v2i_usr if _v2i_usr else _DEFAULT_VID2IMG_USR
                        _v2i_usr_msg = _v2i_usr_tmpl.format(prompt_text=pp.image_prompt)

                        converted_prompt = _run_agent(analysis_model, _v2i_sys, _v2i_usr_msg, max_tokens=1024).strip()

                    pp.image_prompt = converted_prompt
                    image_prompt = converted_prompt
                    db.commit()
                    logger.info("Converted image prompt: %s...", converted_prompt[:100])
            except Exception as e:
                logger.warning("Video prompt conversion failed, using original: %s", e)

        # Use image_prompt if available, otherwise truncate original
        final_prompt = image_prompt if image_prompt else pp.prompt_text[:3000]

        # For storyboard templates, image_prompt is required - don't fallback to raw prompt_text
        if grid in ["story_flow_5", "industrial_macro_5"] and not image_prompt:
            pp.image_status = "failed"
            pp.error_message = "Failed to generate storyboard image prompt from template"
            db.commit()
            return

        base_url = "https://api.lk888.ai/api/v1" if image_model == "updrama-image-2" else "https://api.laozhang.ai/v1"
        service = ImageGeneratorService(api_key=api_key, base_url=base_url)

        # Select best reference image from product images
        reference_image = None
        try:
            images_dir = Path(product.images_dir)
            image_paths = sorted(str(p) for p in images_dir.glob("image_*")) if images_dir.exists() else []
            if image_paths:
                path_by_name = {Path(p).name: p for p in image_paths}
                doc_images: list[dict] = []

                def _run_picker_agent(model, system_prompt: str, user_prompt: str) -> str:
                    if hasattr(model, "chat"):
                        return model.chat(system_prompt, user_prompt, max_tokens=80)
                    if hasattr(model, "analyze_text"):
                        return model.analyze_text(
                            f"SYSTEM PROMPT:\n{system_prompt}\n\nUSER PROMPT:\n{user_prompt}",
                            task="direct",
                        )
                    raise RuntimeError(f"Model {type(model).__name__} does not support text generation")

                def _score_reference_candidate(img: dict) -> int:
                    text = " ".join(
                        str(img.get(k, ""))
                        for k in (
                            "filename", "basic_recognition", "product_understanding",
                            "focus_subject", "relevance", "context_alignment",
                        )
                    ).lower()
                    score = 0
                    relevance = str(img.get("relevance", "")).lower()
                    if relevance == "primary_product":
                        score += 120
                    elif relevance == "usage_scene":
                        score += 55
                    elif relevance in {"packaging_or_infographic", "comparison"}:
                        score += 20
                    elif relevance == "unrelated_or_ambiguous":
                        score -= 120

                    if "target product" in text or "actual product" in text:
                        score += 35
                    if "main subject" in text or "fully visible" in text or "complete" in text:
                        score += 25
                    if "clear" in text or "in focus" in text or "front" in text or "3/4" in text:
                        score += 15
                    if "plug" in text or "wall-plug" in text or "electricity saver" in text or "power stabilizer" in text:
                        score += 20
                    # Prefer clean product-reference photography when semantic labels are missing.
                    reference_quality_terms = {
                        "centered": 15,
                        "isolated": 20,
                        "studio": 15,
                        "e-commerce": 15,
                        "clean": 10,
                        "neutral": 10,
                        "seamless": 10,
                        "uniform": 8,
                        "without distracting": 15,
                        "strictly on the hardware": 15,
                    }
                    for term, points in reference_quality_terms.items():
                        if term in text:
                            score += points

                    # Penalize assets and context images that are poor identity references.
                    penalties = (
                        "logo", "favicon", "icon", "sprite", "phone screen", "mobile phone",
                        "app ui", "screenshot", "chart", "room", "different product",
                        "unrelated", "ambiguous", "prop", "background",
                    )
                    for term in penalties:
                        if term in text:
                            score -= 30
                    return score

                # Read product doc for image descriptions and deterministic fallback.
                doc_path = images_dir.parent / "product_doc.json"
                if doc_path.exists():
                    import json
                    doc = json.loads(doc_path.read_text())
                    doc_images = [img for img in doc.get("images", []) if img.get("filename") in path_by_name]

                # Use AI to pick the best reference image based on the image recognition results.
                from app.ai_models import get_model
                analysis_model = get_model(cfg.analysis_model, cfg) if cfg else None
                if analysis_model and (hasattr(analysis_model, 'chat') or hasattr(analysis_model, 'analyze_text')) and len(doc_images) > 1:
                    img_descriptions = []
                    for img in doc_images:
                        desc_parts = [
                            f"Image {img.get('index')} ({img.get('filename')}):",
                            f"  Relevance: {img.get('relevance', '')}",
                            f"  Focus subject: {img.get('focus_subject', '')}",
                            f"  Recognition: {img.get('basic_recognition', '')[:500]}",
                            f"  Understanding: {img.get('product_understanding', '')[:500]}",
                            f"  Context alignment: {img.get('context_alignment', '')[:300]}",
                        ]
                        img_descriptions.append("\n".join(desc_parts))

                    img_descriptions_text = "\n\n".join(img_descriptions)

                    _DEFAULT_PICKER_SYS = (
                        "You are an expert at selecting the best product reference image for AI image generation. "
                        "CRITICAL REQUIREMENTS:\n"
                        "1. Product must be FULLY VISIBLE and COMPLETE (not cropped, not partially hidden)\n"
                        "2. Product must be CLEAR, IN FOCUS, and occupy a significant portion of the image\n"
                        "3. Prefer images where relevance is primary_product and focus_subject is the target product\n"
                        "4. Prefer front-facing or 3/4 view angles that show product identity details\n"
                        "5. Avoid logos, icons, phone screens, app UI, screenshots, charts, rooms, and lifestyle props\n"
                        "6. Avoid unrelated_or_ambiguous images even if they look visually clean\n\n"
                        "Analyze each image description carefully and select the ONE image that best preserves "
                        "the product's exact external appearance for reference-image generation.\n\n"
                        "Reply with ONLY the filename (e.g. image_0.png), nothing else."
                    )
                    _DEFAULT_PICKER_USR = (
                        "Available images:\n{img_descriptions_text}\n\n"
                        "Which filename is the best product identity reference image?"
                    )
                    from app.api.agent_prompts import get_agent_prompt
                    _picker_sys, _picker_usr = get_agent_prompt(db, "reference_image_picker")
                    _picker_sys = _picker_sys if _picker_sys else _DEFAULT_PICKER_SYS
                    _picker_usr_tmpl = _picker_usr if _picker_usr else _DEFAULT_PICKER_USR
                    _picker_usr_msg = _picker_usr_tmpl.format(img_descriptions_text=img_descriptions_text)

                    pick = _run_picker_agent(analysis_model, _picker_sys, _picker_usr_msg).strip()
                    pick_clean = pick.strip().strip("`").strip().strip('"').strip("'")
                    pick_clean = pick_clean.splitlines()[0].strip() if pick_clean else ""
                    if pick_clean:
                        for filename, path in path_by_name.items():
                            if filename == pick_clean or filename in pick_clean:
                                reference_image = path
                                logger.info("AI selected reference image: %s -> %s", pick_clean, path)
                                break

                if not reference_image and doc_images:
                    best = max(doc_images, key=_score_reference_candidate)
                    reference_image = path_by_name.get(best.get("filename"))
                    logger.info(
                        "Deterministic selected reference image: %s (score=%d)",
                        best.get("filename"),
                        _score_reference_candidate(best),
                    )

                if not reference_image:
                    # Last resort: avoid obvious site assets before falling back to the first image.
                    non_asset_paths = [
                        p for p in image_paths
                        if not any(term in Path(p).name.lower() for term in ("logo", "favicon", "sprite", "icon"))
                    ]
                    reference_image = (non_asset_paths or image_paths)[0]
                    logger.info("Using fallback reference image: %s", reference_image)
        except Exception as e:
            logger.warning("Reference image selection failed: %s", e)
            # Fallback to first image if available
            try:
                images_dir = Path(product.images_dir)
                paths = sorted(str(p) for p in images_dir.glob("image_*"))
                non_asset_paths = [
                    p for p in paths
                    if not any(term in Path(p).name.lower() for term in ("logo", "favicon", "sprite", "icon"))
                ]
                if paths:
                    reference_image = (non_asset_paths or paths)[0]
            except Exception:
                pass

        # Extract product description from reference image + instruction board for prompt injection
        product_understanding = ""
        if reference_image:
            logger.info("Extracting product description from reference image: %s", reference_image)
            try:
                from app.ai_models import get_model
                # Use vision_model instead of analysis_model for image analysis
                vision_model = get_model(cfg.vision_model, cfg) if cfg else None
                if vision_model and hasattr(vision_model, 'analyze_image'):
                    # First: extract basic product appearance from reference image
                    _DEFAULT_APPEARANCE_PROMPT = (
                        "Describe ONLY the product in this image in extreme detail. "
                        "Focus on: exact shape, color (be specific like 'vibrant blue', 'matte black'), "
                        "material/texture (silicone, plastic, metal), size/proportions, "
                        "distinctive features, design elements. "
                        "Output a single paragraph under 300 characters. "
                        "Do NOT describe the background, scene, or context."
                    )
                    from app.api.agent_prompts import get_agent_prompt
                    _appear_sys, _ = get_agent_prompt(db, "product_appearance_extractor")
                    _appearance_prompt = _appear_sys if _appear_sys else _DEFAULT_APPEARANCE_PROMPT

                    product_desc = vision_model.analyze_image(
                        reference_image,
                        _appearance_prompt,
                        max_tokens=300
                    )
                    if product_desc and product_desc.strip():
                        product_understanding = f"Product Appearance: {product_desc.strip()}"
                        logger.info(f"Extracted product appearance: {product_desc[:100]}...")

                    # Second: if instruction board exists, extract usage instructions
                    if product.instruction_board_path and Path(product.instruction_board_path).exists():
                        logger.info("Extracting product usage from instruction board: %s", product.instruction_board_path)
                        usage_desc = vision_model.analyze_image(
                            product.instruction_board_path,
                            "Analyze this product instruction board/manual. Extract: "
                            "1. What is this product and its main function? "
                            "2. How to use it correctly (key steps)? "
                            "3. Important details about product parts (which part does what)? "
                            "Output in 2-3 sentences, under 500 characters. Be specific and factual.",
                            max_tokens=500
                        )
                        if usage_desc and usage_desc.strip():
                            product_understanding += f"\n\nProduct Usage: {usage_desc.strip()}"
                            logger.info(f"Extracted product usage: {usage_desc[:100]}...")

                    # Inject comprehensive product understanding into prompt
                    if product_understanding:
                        final_prompt = f"CRITICAL PRODUCT REQUIREMENTS:\n{product_understanding}\n\n--- SCENE DESCRIPTION ---\n{final_prompt}"
                        logger.info(f"Injected comprehensive product understanding ({len(product_understanding)} chars)")
                else:
                    logger.warning("Vision model does not support analyze_image method")
            except Exception as e:
                logger.warning(f"Product understanding extraction failed: {e}")

        # Generate image: use reference mode if we have a reference image
        logger.info("FINAL IMAGE PROMPT (length=%d): %s", len(final_prompt) if final_prompt else 0,
                    final_prompt[:300] if final_prompt else "EMPTY")
        if reference_image:
            logger.info("Using reference image: %s", reference_image)

            # Prepare additional references (instruction board if available)
            additional_refs = []
            if product.instruction_board_path and Path(product.instruction_board_path).exists():
                additional_refs.append(product.instruction_board_path)
                logger.info("Adding instruction board as additional reference: %s", product.instruction_board_path)

            if image_model == "qwen-image-2.0-pro":
                result = service.generate_aliyun_image_with_reference(
                    prompt=final_prompt,
                    reference_image_path=reference_image,
                    model=image_model,
                    grid_layout=generation_grid,
                    aspect_ratio=pp.aspect_ratio or "1:1",
                    additional_references=additional_refs,
                )
            else:
                result = service.generate_image_with_reference(
                    prompt=final_prompt,
                    reference_image_path=reference_image,
                    model=image_model,
                    grid_layout=generation_grid,
                    aspect_ratio=pp.aspect_ratio or "1:1",
                    additional_references=additional_refs,  # Pass instruction board as additional reference
                )
        else:
            result = service.generate_image(
                prompt=final_prompt,
                model=image_model,
                grid_layout=generation_grid,
                aspect_ratio=pp.aspect_ratio or "1:1",
            )

        # Download and save
        products_base = getattr(settings, 'products_dir', 'products')
        output_dir = Path(products_base) / product.id / "generated"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"prompt_{pp.variant_index}_image.jpg"

        saved = service.download_image(result["image_url"], str(output_path))
        pp.image_path = saved
        pp.image_url = result["image_url"]
        pp.image_prompt = final_prompt  # Save the full prompt for inspection
        pp.image_status = "completed"
        pp.error_message = None
        db.commit()

    except Exception as e:
        logger.exception("Image generation failed for prompt %s: %s", prompt_id, e)
        try:
            pp = db.get(ProductPrompt, prompt_id)
            if pp:
                pp.image_status = "failed"
                pp.error_message = str(e)[:1000]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def generate_video_for_prompt(prompt_id: str):
    """Generate a video for a single prompt using selected video generation model."""
    db: Session = SessionLocal()
    try:
        pp = db.get(ProductPrompt, prompt_id)
        if not pp:
            return
        product = db.get(Product, pp.product_id)
        if not product:
            return

        pp.video_status = "generating"
        pp.error_message = None
        db.commit()

        # Read from DB config_json first, fallback to .env settings
        cfg = db.query(ModelConfig).first()
        providers = cfg.get_providers() if cfg else {}

        # Get selected video model from prompt (per-variant) or fallback to global config
        video_model = pp.video_model if pp.video_model else (cfg.video_gen_model if cfg else "happyhorse-1.0")

        # Use generated image as input (if available), otherwise use first product image
        if pp.image_path and Path(pp.image_path).exists():
            # Use the locally saved image file path
            local_image_path = pp.image_path
            # For APIs that need a URL, we'll handle conversion in each backend
            image_url = pp.image_url if pp.image_url and pp.image_url.startswith("http") else None
        elif pp.image_url and pp.image_url.startswith("http"):
            image_url = pp.image_url
            local_image_path = None
        else:
            # Fallback to first product image
            images_dir = Path(product.images_dir)
            ref_images = sorted(images_dir.glob("image_*")) if images_dir.exists() else []
            if not ref_images:
                raise RuntimeError("No images available for video generation")
            local_image_path = str(ref_images[0])
            image_url = None

        # Route to appropriate video generation service based on model
        duration = pp.video_duration or 15
        aspect_ratio = pp.aspect_ratio or "9:16"

        # Get instruction board as second reference image (product detail reference)
        instruction_board_path = None
        enhanced_prompt = pp.prompt_text
        if product.instruction_board_path and Path(product.instruction_board_path).exists():
            instruction_board_path = product.instruction_board_path
            # Enhance prompt to clarify image roles for video generation
            enhanced_prompt = (
                f"IMPORTANT: Two reference images are provided:\n"
                f"1. First image: Use as the video scene composition and camera angle reference\n"
                f"2. Second image: Product instruction board - use ONLY for product appearance details (color, shape, design)\n\n"
                f"{pp.prompt_text}"
            )

        if video_model == "omni_flash-10s":
            result = _generate_video_updrama(enhanced_prompt, image_url, providers, aspect_ratio=aspect_ratio, local_image_path=local_image_path)
        elif video_model == "veo-3.1":
            result = _generate_video_veo(enhanced_prompt, image_url, providers, duration=duration, local_image_path=local_image_path)
        elif video_model in ["happyhorse-1.0", "wan-2.6"]:
            result = _generate_video_aliyun(enhanced_prompt, image_url, providers, model_name=video_model, duration=duration, local_image_path=local_image_path, instruction_board_path=instruction_board_path)
        else:  # seedance-2.0 (default)
            result = _generate_video_volcengine(enhanced_prompt, image_url, providers, duration=duration, local_image_path=local_image_path, instruction_board_path=instruction_board_path)

        if result["status"] == "completed":
            pp.video_url = result.get("video_url", "")
            pp.video_status = "completed"
            pp.error_message = None

            # Optionally download video
            if pp.video_url:
                products_base = getattr(settings, 'products_dir', 'products')
                output_dir = Path(products_base) / product.id / "videos"
                output_dir.mkdir(parents=True, exist_ok=True)
                output_path = output_dir / f"prompt_{pp.variant_index}_video.mp4"

                # Download video
                import requests
                response = requests.get(pp.video_url, timeout=60)
                response.raise_for_status()
                with open(output_path, "wb") as f:
                    f.write(response.content)
                pp.video_path = str(output_path)
        else:
            pp.video_status = "failed"
            pp.error_message = result.get("message", "Video generation failed without a detailed error")

        db.commit()

    except Exception as e:
        logger.exception("Video generation failed for prompt %s: %s", prompt_id, e)
        try:
            pp = db.get(ProductPrompt, prompt_id)
            if pp:
                pp.video_status = "failed"
                pp.error_message = str(e)[:1000]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Video generation backends
# ---------------------------------------------------------------------------

def _generate_video_volcengine(prompt: str, image_url: str, providers: dict, duration: int = 5, local_image_path: str = None, instruction_board_path: str = None) -> dict:
    """Seedance 2.0 via Volcengine (default)."""
    from app.services.video_generator import VideoGeneratorService

    api_key = providers.get("_volcengine_api_key") or getattr(settings, 'volcengine_api_key', '')
    if not api_key:
        raise RuntimeError("volcengine_api_key not configured for Seedance 2.0")

    # Build reference images list (instruction board as second reference)
    reference_images = []
    if instruction_board_path and Path(instruction_board_path).exists():
        import base64
        from io import BytesIO
        from PIL import Image as PILImage
        img_pil = PILImage.open(instruction_board_path)
        max_dim = 1280
        if max(img_pil.size) > max_dim:
            ratio = max_dim / max(img_pil.size)
            new_size = (int(img_pil.size[0] * ratio), int(img_pil.size[1] * ratio))
            img_pil = img_pil.resize(new_size, PILImage.LANCZOS)
        buf = BytesIO()
        img_pil.save(buf, format='JPEG', quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode()
        reference_images.append(f"data:image/jpeg;base64,{b64}")

    service = VideoGeneratorService(
        api_key=api_key,
        base_url="https://ark.cn-beijing.volces.com/api/v3",
    )
    return service.generate_video(image_url=image_url, prompt=prompt, model="seedance-2.0", duration=duration, local_image_path=local_image_path, reference_images=reference_images or None)


def _generate_video_veo(prompt: str, image_url: str, providers: dict, duration: int = 5, local_image_path: str = None) -> dict:
    """Veo 3.1 via LaoZhang proxy (OpenAI Chat Completions streaming)."""
    import os
    from openai import OpenAI

    api_key = providers.get("_laozhang_api_key") or getattr(settings, 'laozhang_api_key', '')
    if not api_key:
        raise RuntimeError("laozhang_api_key not configured for Veo 3.1")

    # Clear proxy env vars to avoid httpx Client errors
    old_env = {}
    for k in list(os.environ.keys()):
        if 'proxy' in k.lower():
            old_env[k] = os.environ.pop(k)

    try:
        import httpx
        http_client = httpx.Client(verify=False, timeout=300.0)
        client = OpenAI(
            api_key=api_key,
            base_url="https://api.laozhang.ai/v1",
            timeout=300.0,
            http_client=http_client,
        )

        # Build message content
        content_parts: list[dict] = [{"type": "text", "text": prompt}]
        if image_url:
            content_parts.append({"type": "image_url", "image_url": {"url": image_url}})

        # Use veo-3.1-fl for image-to-video, veo-3.1 for text-to-video
        model = "veo-3.1-fl" if image_url else "veo-3.1"

        logger.info("Submitting Veo 3.1 video generation via LaoZhang (model: %s)", model)
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": content_parts}],
            stream=True,
        )

        # Stream through chunks; the final chunk contains the video URL
        video_url = None
        for chunk in response:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                content_text = delta.content.strip()
                # Video URL might be in markdown format: [text](url)
                if "http" in content_text:
                    # Extract URL from markdown link if present
                    import re
                    match = re.search(r'\((https?://[^\)]+)\)', content_text)
                    if match:
                        video_url = match.group(1)
                    elif content_text.startswith("http"):
                        video_url = content_text
                    else:
                        # Try to find any http URL in the text
                        match = re.search(r'https?://[^\s\)]+', content_text)
                        if match:
                            video_url = match.group(0)

        if video_url and video_url.startswith("http"):
            return {"status": "completed", "video_url": video_url, "task_id": None}

        raise RuntimeError(f"Veo 3.1 did not return a valid video URL. Last content: {video_url}")
    finally:
        os.environ.update(old_env)


def _generate_video_aliyun(prompt: str, image_url: str, providers: dict, model_name: str = "wan-2.6", duration: int = 5, local_image_path: str = None, instruction_board_path: str = None) -> dict:
    """Wan 2.6 / HappyHorse 1.0 via Alibaba Cloud DashScope async task API."""
    import requests
    import time
    import base64

    api_key = providers.get("_aliyun_api_key") or getattr(settings, 'aliyun_api_key', '')
    if not api_key:
        raise RuntimeError("aliyun_api_key not configured")

    base_url = "https://dashscope.aliyuncs.com/api/v1"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }

    # Map model selection to DashScope model name
    # Use i2v (image-to-video) if we have an image, otherwise t2v (text-to-video)
    has_image = bool(image_url or local_image_path)
    if model_name == "happyhorse-1.0":
        dashscope_model = "happyhorse-1.0-i2v" if has_image else "happyhorse-1.0-t2v"
    else:
        dashscope_model = "wan2.6-i2v" if has_image else "wan2.6-t2v"

    # Build input with image if available
    input_data = {"prompt": prompt}
    if has_image:
        if image_url and image_url.startswith("http"):
            img_ref = image_url
        elif local_image_path:
            # Compress and encode local image for DashScope (max ~1.5MB base64)
            import base64
            from io import BytesIO
            from PIL import Image as PILImage
            img_pil = PILImage.open(local_image_path)
            # Resize if too large (max 1280px on longest side)
            max_dim = 1280
            if max(img_pil.size) > max_dim:
                ratio = max_dim / max(img_pil.size)
                new_size = (int(img_pil.size[0] * ratio), int(img_pil.size[1] * ratio))
                img_pil = img_pil.resize(new_size, PILImage.LANCZOS)
            buf = BytesIO()
            img_pil.save(buf, format='JPEG', quality=85)
            img_b64 = base64.b64encode(buf.getvalue()).decode()
            img_ref = f"data:image/jpeg;base64,{img_b64}"
            logger.info("Compressed image for DashScope: %dKB base64", len(img_b64) // 1024)
        else:
            img_ref = None

        if img_ref:
            media = [{"type": "first_frame", "url": img_ref}]
            # Note: DashScope only supports "first_frame" type, instruction board understanding
            # is injected via the enhanced prompt text instead of as a reference image
            input_data["media"] = media

    # Submit async video generation task
    payload = {
        "model": dashscope_model,
        "input": input_data,
        "parameters": {
            "resolution": "1080P",
            "duration": duration,
        },
    }

    logger.info("Submitting %s video generation task via DashScope (model: %s)", model_name, dashscope_model)
    resp = requests.post(
        f"{base_url}/services/aigc/video-generation/video-synthesis",
        headers=headers,
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    task_id = data.get("output", {}).get("task_id")
    if not task_id:
        raise RuntimeError(f"DashScope did not return task_id: {data}")

    logger.info("Wan 2.6 task submitted: %s", task_id)

    # Poll for completion (drop the async header for polling)
    poll_headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    for attempt in range(120):
        time.sleep(3)
        poll_resp = requests.get(
            f"{base_url}/tasks/{task_id}",
            headers=poll_headers,
            timeout=10,
        )
        poll_resp.raise_for_status()
        poll_data = poll_resp.json()

        status = poll_data.get("output", {}).get("task_status", "").upper()
        if status == "SUCCEEDED":
            video_url = poll_data.get("output", {}).get("video_url")
            return {"status": "completed", "video_url": video_url, "task_id": task_id}
        elif status == "FAILED":
            msg = poll_data.get("output", {}).get("message", "Unknown error")
            raise RuntimeError(f"Wan 2.6 generation failed: {msg}")
        # PENDING / RUNNING → keep polling

    raise RuntimeError("Wan 2.6 video generation timeout after 360s")



def _upload_to_litterbox(path: Path, lifetime: str = "1h") -> str:
    """Upload an image to litterbox.catbox.moe for temp public hosting."""
    result = subprocess.run(
        [
            "curl", "--noproxy", "*", "--http1.1", "-fsS",
            "-F", "reqtype=fileupload",
            "-F", f"time={lifetime}",
            "-F", f"fileToUpload=@{path}",
            "https://litterbox.catbox.moe/resources/internals/api.php",
        ],
        check=True, capture_output=True, text=True, timeout=180,
    )
    url = result.stdout.strip()
    if not url.startswith("https://"):
        raise RuntimeError(f"Unexpected litterbox response for {path}: {url[:300]}")
    return url


def _generate_video_updrama(prompt: str, image_url: str, providers: dict, aspect_ratio: str = "9:16", local_image_path: str = None, reference_images: list[str] = None) -> dict:
    """Omni Flash 10s via Updrama API (api.lk888.ai)."""
    import requests
    import time

    api_key = providers.get("_updrama_api_key") or getattr(settings, 'updrama_api_key', '')
    if not api_key:
        raise RuntimeError("updrama_api_key not configured")

    base_url = "https://api.lk888.ai"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # Build images array (up to 7 reference images)
    images = list(reference_images or [])
    if not images:
        if image_url and image_url.startswith("http"):
            images.append(image_url)
        elif local_image_path:
            local_path = Path(local_image_path)
            if local_path.exists():
                # Upload to temp hosting for public URL (Updrama rejects base64)
                import subprocess
                uploaded_url = _upload_to_litterbox(local_path)
                logger.info("Uploaded storyboard to %s", uploaded_url)
                images.append(uploaded_url)

    payload = {
        "model": "omni_flash-10s",
        "prompt": prompt,
        "params": {
            "aspect_ratio": aspect_ratio,
        },
    }
    if images:
        payload["params"]["images"] = images

    logger.info("Submitting Omni Flash 10s task to %s/v1/media/generate", base_url)
    resp = requests.post(
        f"{base_url}/v1/media/generate",
        headers=headers,
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    task_id = data.get("id") or (data.get("data") or {}).get("task_id")
    if not task_id:
        raise RuntimeError(f"Updrama did not return task id: {data}")

    logger.info("Omni Flash 10s task submitted: %s", task_id)

    # Poll for completion
    for attempt in range(240):
        time.sleep(3)
        poll_resp = requests.get(
            f"{base_url}/v1/media/status",
            headers=headers,
            params={"task_id": task_id},
            timeout=10,
        )
        poll_resp.raise_for_status()
        poll_data = poll_resp.json()

        if poll_data.get("is_final"):
            if poll_data.get("state") == "success":
                result_url = poll_data.get("result_url", "")
                logger.info("Omni Flash 10s completed: %s", result_url)
                return {"status": "completed", "video_url": result_url}
            else:
                error_msg = poll_data.get("error", poll_data.get("status", "Unknown error"))
                raise RuntimeError(f"Omni Flash 10s failed: {error_msg}")

        # pending / running → continue polling
        logger.debug("Omni Flash 10s polling: state=%s progress=%s", poll_data.get("state"), poll_data.get("progress"))

    raise RuntimeError("Omni Flash 10s video generation timeout after 720s")
