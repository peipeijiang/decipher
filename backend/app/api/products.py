"""Product video generation API routes."""
import json
import threading
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.models.product_prompt import ProductPrompt
from app.schemas.product import ProductCreate, ProductOut, ProductPromptOut, ProductDocOut
from app.tasks.product_pipeline import (
    run_product_pipeline, get_product_progress,
    generate_image_for_prompt, generate_video_for_prompt,
    _set_progress,
)
from app.services.prompt_generator import TEMPLATES

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("/templates")
def get_templates(db: Session = Depends(get_db)):
    """Get available video style templates from database with fallback."""
    try:
        from app.models.template import VideoTemplate
        templates = db.query(VideoTemplate).filter(VideoTemplate.is_active == True).all()

        if templates:
            return {
                "templates": [
                    {"key": t.key, "name": t.name}
                    for t in templates
                ]
            }
    except Exception:
        pass

    # Fallback to hardcoded templates
    return {
        "templates": [
            {"key": key, "name": template["name"]}
            for key, template in TEMPLATES.items()
        ]
    }


@router.post("/create")
def create_product(body: ProductCreate, db: Session = Depends(get_db)):
    # Check if URL already exists (any status)
    existing = db.query(Product).filter(Product.url == body.url).first()
    if existing:
        result = ProductOut.model_validate(existing).model_dump()
        result["existed"] = True
        return result

    product = Product(url=body.url)
    db.add(product)
    db.commit()
    db.refresh(product)
    threading.Thread(target=run_product_pipeline, args=(product.id,), daemon=True).start()
    result = ProductOut.model_validate(product).model_dump()
    result["existed"] = False
    return result


@router.post("/{product_id}/rerun", response_model=ProductOut)
def rerun_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    if product.status in ("pending", "scraping", "analyzing"):
        raise HTTPException(400, "Product is already running")

    # Clear old prompts
    db.query(ProductPrompt).filter(ProductPrompt.product_id == product_id).delete()

    # Reset status and clear error
    product.status = "pending"
    product.error_message = None
    db.commit()
    db.refresh(product)

    # Reset progress tracking
    from app.tasks.product_pipeline import _progress
    if product_id in _progress:
        del _progress[product_id]

    threading.Thread(target=run_product_pipeline, args=(product.id,), daemon=True).start()
    return product


@router.post("/{product_id}/resume", response_model=ProductOut)
def resume_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    if product.status != "failed":
        raise HTTPException(400, "Can only resume failed products")

    # Reset status and clear error
    product.status = "pending"
    product.error_message = None
    db.commit()
    db.refresh(product)

    # Determine where to resume from
    progress = get_product_progress(product_id)
    if progress["scrape"] < 100:
        start_from = "scrape"
    elif progress["doc"] < 100:
        start_from = "doc"
    else:
        start_from = "prompts"

    from app.tasks.product_pipeline import resume_product_pipeline
    threading.Thread(target=resume_product_pipeline, args=(product.id, start_from), daemon=True).start()
    return product


@router.post("/{product_id}/reanalyze-doc", response_model=ProductOut)
def reanalyze_product_doc(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    if product.status in ("pending", "scraping", "analyzing"):
        raise HTTPException(400, "Product is already running")
    if not product.images_dir:
        raise HTTPException(400, "Product images are not available")

    product.status = "pending"
    product.error_message = None
    db.commit()
    db.refresh(product)

    from app.tasks.product_pipeline import resume_product_pipeline
    threading.Thread(target=resume_product_pipeline, args=(product.id, "doc"), daemon=True).start()
    return product


@router.get("", response_model=list[ProductOut])
def list_products(status: str | None = None, archive_status: str = "active", db: Session = Depends(get_db)):
    q = db.query(Product)
    if archive_status == "archived":
        q = q.filter(Product.archive_status == "archived")
    else:
        q = q.filter(Product.archive_status == "active")
    if status:
        q = q.filter(Product.status == status)
    q = q.order_by(Product.created_at.desc())
    return q.all()


@router.patch("/{product_id}/archive", response_model=ProductOut)
def archive_product(product_id: str, db: Session = Depends(get_db)):
    from datetime import datetime
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    product.archive_status = "archived"
    product.archived_at = datetime.utcnow()
    db.commit()
    db.refresh(product)
    return product


@router.patch("/{product_id}/activate", response_model=ProductOut)
def activate_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    product.archive_status = "active"
    product.archived_at = None
    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@router.get("/{product_id}/progress")
def get_progress(product_id: str, db: Session = Depends(get_db)):
    progress = get_product_progress(product_id)
    if any(progress.get(key, 0) > 0 for key in ("scrape", "doc", "prompts")) or progress.get("error"):
        return progress

    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    prompt_count = db.query(ProductPrompt).filter(ProductPrompt.product_id == product_id).count()
    inferred = {
        "scrape": 100 if product.images_dir or product.doc_json_path or product.status == "completed" else 0,
        "doc": 100 if product.doc_json_path or product.status == "completed" else 0,
        "prompts": 100 if prompt_count > 0 else 0,
        "error": product.error_message,
        "doc_current": 0,
        "doc_total": 0,
        "doc_stage": "文档已生成" if product.doc_json_path else "",
    }

    if product.status == "failed":
        inferred["error"] = product.error_message or progress.get("error")

    return inferred


@router.delete("/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    # Delete prompts first
    db.query(ProductPrompt).filter(ProductPrompt.product_id == product_id).delete()
    db.delete(product)
    db.commit()
    # Clean up files
    from app.config import settings
    products_base = getattr(settings, 'products_dir', 'products')
    product_dir = Path(products_base) / product_id
    if product_dir.exists():
        import shutil
        shutil.rmtree(product_dir, ignore_errors=True)
    return {"ok": True}


@router.get("/{product_id}/doc")
def get_product_doc(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.doc_path:
        raise HTTPException(404, "Product doc not found")
    path = Path(product.doc_path)
    if not path.exists():
        raise HTTPException(404, "Doc file missing")
    return FileResponse(str(path), media_type="text/markdown")


@router.get("/{product_id}/doc/json", response_model=ProductDocOut)
def get_product_doc_json(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.doc_json_path:
        raise HTTPException(404, "Product JSON doc not found")
    path = Path(product.doc_json_path)
    if not path.exists():
        raise HTTPException(404, "JSON doc file missing")
    data = json.loads(path.read_text(encoding="utf-8"))
    return data


@router.get("/{product_id}/images/{filename}")
def get_product_image(product_id: str, filename: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.images_dir:
        raise HTTPException(404, "Product not found")
    path = Path(product.images_dir) / filename
    if not path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(str(path))


# --- Prompt routes ---

@router.get("/{product_id}/prompts", response_model=list[ProductPromptOut])
def list_prompts(product_id: str, db: Session = Depends(get_db)):
    return (
        db.query(ProductPrompt)
        .filter(ProductPrompt.product_id == product_id)
        .order_by(ProductPrompt.variant_index)
        .all()
    )


@router.post("/prompts/{prompt_id}/generate-image")
def trigger_image_generation(prompt_id: str, body: dict = {}, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")
    # Save grid_layout and aspect_ratio if provided
    if body.get("grid_layout"):
        pp.grid_layout = body["grid_layout"]
    if body.get("aspect_ratio"):
        pp.aspect_ratio = body["aspect_ratio"]
    pp.image_status = "generating"
    pp.error_message = None
    pp.image_url = None
    pp.image_path = None
    db.commit()
    threading.Thread(target=generate_image_for_prompt, args=(prompt_id,), daemon=True).start()
    return {"ok": True, "prompt_id": prompt_id}


@router.get("/prompts/{prompt_id}/image")
def get_generated_image(prompt_id: str, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp or not pp.image_path:
        raise HTTPException(404, "Generated image not found")
    path = Path(pp.image_path)
    if not path.exists():
        raise HTTPException(404, "Image file missing")
    return FileResponse(str(path))


@router.post("/prompts/{prompt_id}/generate-video")
def trigger_video_generation(prompt_id: str, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")
    threading.Thread(target=generate_video_for_prompt, args=(prompt_id,), daemon=True).start()
    return {"ok": True, "prompt_id": prompt_id}


@router.get("/prompts/{prompt_id}/video")
def get_generated_video(prompt_id: str, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")
    # Serve local file if available (CDN URLs expire)
    if pp.video_path and Path(pp.video_path).exists():
        return FileResponse(str(Path(pp.video_path)), media_type="video/mp4")
    if pp.video_url:
        return {"video_url": pp.video_url, "status": pp.video_status}
    raise HTTPException(404, "Generated video not found")


@router.patch("/prompts/{prompt_id}", response_model=ProductPromptOut)
def update_prompt(prompt_id: str, body: dict, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")
    if "prompt_text" in body:
        pp.prompt_text = body["prompt_text"]
        pp.error_message = None
    if "grid_layout" in body:
        pp.grid_layout = body["grid_layout"]
        pp.image_prompt = None  # Reset so it regenerates with correct format
        pp.error_message = None
    if "aspect_ratio" in body:
        pp.aspect_ratio = body["aspect_ratio"]
        pp.error_message = None
    if "video_style" in body:
        pp.video_style = body["video_style"]
    if "video_model" in body:
        pp.video_model = body["video_model"]
    if "video_duration" in body:
        pp.video_duration = body["video_duration"]
    db.commit()
    db.refresh(pp)
    return pp


@router.post("/prompts/{prompt_id}/refine")
def refine_prompt(prompt_id: str, body: dict, db: Session = Depends(get_db)):
    """Refine an existing prompt based on user instructions."""
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")

    instruction = body.get("instruction", "").strip()
    if not instruction:
        raise HTTPException(400, "instruction is required")

    from app.ai_models import get_model
    from app.models.config import ModelConfig
    from app.api.agent_prompts import get_agent_prompt

    cfg = db.query(ModelConfig).first() or ModelConfig()
    analysis_model = get_model(cfg.analysis_model, cfg)

    _refiner_system, _ = get_agent_prompt(db, "prompt_refiner")
    if _refiner_system:
        refine_prompt_text = _refiner_system.format(
            instruction=instruction,
            prompt_text=pp.prompt_text,
            video_duration=pp.video_duration,
        )
    else:
        refine_prompt_text = (
            f"You are an expert TikTok video scriptwriter. Refine the following video prompt based on the user's instruction.\n\n"
            f"User instruction: {instruction}\n\n"
            f"Original prompt:\n{pp.prompt_text}\n\n"
            f"RULES:\n"
            f"1. Keep the SAME format with all tags: [Equipment], [Video Style], [Video Music], [Video Effects], [Hook], [Video Content], [Product Consistency]\n"
            f"2. Video duration must stay at {pp.video_duration} seconds\n"
            f"3. Apply the user's instruction while preserving the overall structure\n"
            f"4. Keep [Product Consistency] unchanged\n"
            f"5. [Hook]: A short, punchy opening line. One impactful sentence\n"
            f"6. [Video Content]: Use flexible timestamp intervals. Each segment includes visual action and spoken dialogue. Text overlay: MAXIMUM 2 segments in the entire video, only for key product features/selling points. All other segments have NO text overlay.\n"
            f"7. Return ONLY the refined prompt starting with [Equipment]"
        )

    raw = analysis_model.analyze_text(refine_prompt_text, task="direct")

    pp.prompt_text = raw.strip() if raw else pp.prompt_text
    pp.image_prompt = None  # Reset image prompt since content changed
    pp.image_status = "pending"
    pp.image_path = None
    pp.image_url = None
    pp.error_message = None
    db.commit()
    db.refresh(pp)
    return ProductPromptOut.model_validate(pp)


@router.post("/prompts/{prompt_id}/regenerate")
def regenerate_prompt(prompt_id: str, body: dict, db: Session = Depends(get_db)):
    """Regenerate a single prompt with a different video style template and optional hook."""
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")

    template_key = body.get("template_key", pp.video_style or "grwm")
    hook_key = body.get("hook_key", pp.hook_key)  # None / "auto" / specific key

    product = db.get(Product, pp.product_id)
    if not product or not product.doc_json_path:
        raise HTTPException(400, "Product doc not found")

    from app.services.prompt_generator import get_template
    from app.ai_models import get_model
    from app.models.config import ModelConfig

    cfg = db.query(ModelConfig).first() or ModelConfig()
    analysis_model = get_model(cfg.analysis_model, cfg)

    from pathlib import Path
    doc_path = Path(product.doc_json_path)
    if not doc_path.exists():
        raise HTTPException(400, "Product doc file not found")
    product_info = json.loads(doc_path.read_text(encoding="utf-8"))

    template = get_template(template_key)
    consistency = (
        f"Preserve the exact design, color, and appearance of {product_info.get('title', 'the product')}: "
        f"{product_info.get('appearance', 'as shown in reference images')}"
    )

    # Resolve hook instruction
    hook_instruction = ""
    resolved_hook_key = hook_key
    if hook_key == "auto":
        # Smart: pick best hook based on product info
        try:
            from app.models.template import HookTemplate
            from app.api.agent_prompts import get_agent_prompt
            hooks = db.query(HookTemplate).filter(HookTemplate.is_active == True).all()
            if hooks:
                hook_names = "\n".join(
                    f"- {h.key} ({h.name}): {h.description}. "
                    f"Example: \"{json.loads(h.examples)[0] if h.examples else 'N/A'}\""
                    for h in hooks
                )
                _hook_picker_system, _ = get_agent_prompt(db, "hook_picker")
                if _hook_picker_system:
                    pick_prompt = _hook_picker_system.format(
                        product_title=product_info.get('title', ''),
                        product_description=product_info.get('description', '')[:200],
                        hook_names=hook_names,
                    )
                else:
                    pick_prompt = (
                        f"Product: {product_info.get('title', '')}. {product_info.get('description', '')[:200]}\n\n"
                        f"Choose the BEST hook strategy for this product from:\n{hook_names}\n\n"
                        f"Reply with ONLY the key (e.g. pain_point). No explanation."
                    )
                picked = analysis_model.analyze_text(pick_prompt, task="direct").strip().lower()
                matched = next((h for h in hooks if h.key == picked), None)
                if matched:
                    resolved_hook_key = matched.key
                    import json as _json
                    examples = _json.loads(matched.examples) if matched.examples else []
                    hook_instruction = f"\nFor [Hook], use the '{matched.name}' strategy. Example: \"{examples[0] if examples else matched.description}\""
        except Exception:
            pass
    elif hook_key and hook_key != "none":
        try:
            from app.models.template import HookTemplate
            hook = db.query(HookTemplate).filter(HookTemplate.key == hook_key, HookTemplate.is_active == True).first()
            if hook:
                import json as _json
                examples = _json.loads(hook.examples) if hook.examples else []
                hook_instruction = f"\nFor [Hook], use the '{hook.name}' strategy. Example: \"{examples[0] if examples else hook.description}\""
        except Exception:
            pass

    # Check if template has builtin hook
    has_builtin_hook = False
    try:
        from app.models.template import VideoTemplate as VT
        vt = db.query(VT).filter(VT.key == template_key).first()
        if vt and vt.has_builtin_hook:
            has_builtin_hook = True
    except Exception:
        pass

    from app.api.agent_prompts import get_agent_prompt as _gap
    _regen_system, _ = _gap(db, "single_prompt_regenerator")

    # Preamble: product context + template (always dynamic)
    single_prompt = (
        f"You are an expert TikTok marketing video scriptwriter.\n\n"
        f"Product info:\n{json.dumps(product_info, ensure_ascii=False)}\n\n"
        f"Template style: {template['name']}\n"
        f"Template structure:\n{template['structure'].format(hook='{unique hook}', content='{unique content}', consistency=consistency)}\n"
        f"{hook_instruction}\n"
    )

    if _regen_system and not has_builtin_hook:
        # DB-sourced rules for the standard (non-builtin-hook) path
        single_prompt += _regen_system.format(
            video_duration=pp.video_duration,
            max_spoken_words=int(pp.video_duration * 2.5),
            consistency=consistency,
        )
    elif has_builtin_hook:
        single_prompt += (
            f"IMPORTANT RULES:\n"
            f"1. Video duration is {pp.video_duration} seconds. All [Video Content] timestamps MUST total exactly {pp.video_duration}s.\n"
            f"2. CRITICAL: Total spoken dialogue/voiceover must NOT exceed {int(pp.video_duration * 2.5)} words. Keep lines short and punchy.\n"
            f"3. This template has a BUILT-IN hook structure in [Video Content]. Do NOT include a separate [Hook] field.\n"
            f"4. You MUST include these fields: [Equipment], [Video Style], [Video Music], [Video Effects], [Video Content], [Product Consistency].\n"
            f"5. [Video Content]: Follow the template's phase structure exactly. Text overlay: MAXIMUM 2 segments. Content flows as one continuous story.\n"
            f"6. [Product Consistency] MUST contain: {consistency}\n\n"
            f"Generate exactly 1 video prompt variant. Write entirely in English. "
            f"Return ONLY the full prompt text starting with [Equipment] and ending with [Product Consistency]."
        )
    else:
        # Fallback: original hardcoded rules
        single_prompt += (
            f"IMPORTANT RULES:\n"
            f"1. Video duration is {pp.video_duration} seconds. All [Video Content] timestamps MUST total exactly {pp.video_duration}s.\n"
            f"2. CRITICAL: Total spoken dialogue/voiceover must NOT exceed {int(pp.video_duration * 2.5)} words. Keep lines short and punchy.\n"
            f"3. You MUST include ALL template fields: [Equipment], [Video Style], [Video Music], [Video Effects], [Hook], [Video Content], [Product Consistency].\n"
            f"4. [Hook]: A short, punchy opening line based on the hook strategy. One impactful sentence.\n"
            f"5. [Video Content]: Use flexible timestamp intervals based on content rhythm. Each segment includes visual action and spoken dialogue. Text overlay: MAXIMUM 2 segments in the entire video, only for key product features/selling points. Content flows as one continuous story.\n"
            f"6. [Product Consistency] MUST contain: {consistency}\n\n"
            f"Generate exactly 1 video prompt variant. Write entirely in English. "
            f"Return ONLY the full prompt text starting with [Equipment] and ending with [Product Consistency]."
        )

    raw = analysis_model.analyze_text(single_prompt, task="direct")

    pp.prompt_text = raw.strip() if raw else pp.prompt_text
    pp.video_style = template_key
    pp.hook_key = resolved_hook_key if hook_key else None
    pp.image_prompt = None
    pp.image_status = "pending"
    pp.image_path = None
    pp.image_url = None
    pp.error_message = None
    db.commit()
    db.refresh(pp)
    return ProductPromptOut.model_validate(pp)


@router.post("/{product_id}/generate-videos")
def trigger_batch_video_generation(product_id: str, db: Session = Depends(get_db)):
    prompts = db.query(ProductPrompt).filter(ProductPrompt.product_id == product_id).all()
    if not prompts:
        raise HTTPException(404, "No prompts found for product")
    for pp in prompts:
        threading.Thread(target=generate_video_for_prompt, args=(pp.id,), daemon=True).start()
    return {"ok": True, "count": len(prompts)}


@router.post("/prompts/{prompt_id}/cancel")
def cancel_task(prompt_id: str, body: dict = {}, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")
    task_type = body.get("type", "all")
    if task_type in ("image", "all") and pp.image_status == "generating":
        pp.image_status = "pending"
    if task_type in ("video", "all") and pp.video_status == "generating":
        pp.video_status = "pending"
    db.commit()
    return {"ok": True}


def _generate_instruction_board(product_id: str):
    """Background task: generate instruction board image for a product."""
    import json
    from app.database import SessionLocal
    from app.config import settings
    from app.models.product import Product
    from app.models.config import ModelConfig
    from app.services.image_generator import ImageGeneratorService

    db: Session = SessionLocal()
    try:
        product = db.get(Product, product_id)
        if not product or not product.doc_json_path:
            return

        doc_path = Path(product.doc_json_path)
        if not doc_path.exists():
            raise RuntimeError("Product doc JSON not found")

        doc = json.loads(doc_path.read_text(encoding="utf-8"))

        # Build rich content from enhanced doc fields
        usage_steps = doc.get('usage_steps', [])
        steps_text = "\n".join(f"  {i+1}. {s}" for i, s in enumerate(usage_steps)) if usage_steps else "  (derive from product type)"
        preparation = doc.get('preparation', [])
        prep_text = "\n".join(f"  - {p}" for p in preparation) if preparation else "  (derive from product type)"
        tips = doc.get('tips', [])
        tips_text = "\n".join(f"  - {t}" for t in tips) if tips else "  (derive from product type)"
        warnings = doc.get('warnings', [])
        warnings_text = "\n".join(f"  - {w}" for w in warnings) if warnings else "  (derive from product type)"
        key_parts = doc.get('key_parts', [])
        parts_text = "\n".join(f"  - {p}" for p in key_parts) if key_parts else "  (derive from images)"

        from app.api.agent_prompts import get_agent_prompt as _gap_ib
        _ib_system, _ = _gap_ib(db, "instruction_board_generator")
        _ib_vars = dict(
            title=doc.get('title', ''),
            category=doc.get('category', 'other'),
            usage=doc.get('usage', '')[:300],
            target_users=doc.get('target_users', 'general consumers'),
            selling_points=doc.get('selling_points', '')[:300],
            appearance=doc.get('appearance', '')[:300],
            parts_text=parts_text,
            prep_text=prep_text,
            steps_text=steps_text,
            tips_text=tips_text,
            warnings_text=warnings_text,
        )
        if _ib_system:
            prompt = _ib_system.format(**_ib_vars)
        else:
            prompt = (
                f"[Highest Priority Generation Constraint]\n"
                f"Create one single clean product instruction board image. NOT a storyboard, NOT cinematic frames.\n"
                f"The image must function as a clear user instruction sheet only.\n"
                f"Use a structured editorial layout with clear sections, strong hierarchy, generous white space.\n"
                f"All text must be in ENGLISH, sharp, correct, readable, and free of garbled characters.\n"
                f"Headings, step numbers, warning labels must be large and bold.\n\n"
                f"[Product Info]\n"
                f"Product name: {_ib_vars['title']}\n"
                f"Category: {_ib_vars['category']}\n"
                f"Main purpose: {_ib_vars['usage']}\n"
                f"Target users: {_ib_vars['target_users']}\n"
                f"Key features: {_ib_vars['selling_points']}\n"
                f"Product appearance: {_ib_vars['appearance']}\n\n"
                f"[Top Header]\n"
                f"Large bold title: \"{_ib_vars['title']}\"\n"
                f"Subtitle: \"Product Instruction Guide\"\n"
                f"One-line summary of what this product does.\n\n"
                f"[Upper Left: Product Overview]\n"
                f"Show the product clearly. Label these important parts:\n"
                f"{parts_text}\n\n"
                f"[Upper Right: Usage Preparation]\n"
                f"Before using, the user should:\n"
                f"{prep_text}\n\n"
                f"[Middle: Step-by-Step Instructions]\n"
                f"{steps_text}\n\n"
                f"[Lower Left: Tips & Best Practices]\n"
                f"{tips_text}\n\n"
                f"[Lower Right: Warnings & Common Mistakes]\n"
                f"{warnings_text}\n\n"
                f"[Bottom Footer]\n"
                f"3 blocks: Best Use Scenario | Key Benefit | Quick Reminder\n\n"
                f"[Style]\n"
                f"Premium commercial instruction-sheet style. Clean, modern, informative.\n"
                f"Realistic product visuals matching the reference image EXACTLY.\n"
                f"All text in English, sharp and readable. No Chinese text.\n\n"
                f"[Negative Prompt]\n"
                f"No storyboard, no cinematic frames, no camera movement, no shot numbers.\n"
                f"No blurry text, no garbled characters, no cartoon style, no anime.\n"
                f"No Chinese text. No long paragraphs. No messy layout."
            )

        # Pick first product image as reference
        reference_image = None
        if product.images_dir:
            images_dir = Path(product.images_dir)
            paths = sorted(str(p) for p in images_dir.glob("image_*")) if images_dir.exists() else []
            if paths:
                reference_image = paths[0]

        cfg = db.query(ModelConfig).first()
        providers = cfg.get_providers() if cfg else {}
        api_key = providers.get("_laozhang_api_key") or getattr(settings, 'laozhang_api_key', '')
        if not api_key:
            raise RuntimeError("laozhang_api_key not configured")

        service = ImageGeneratorService(api_key=api_key)

        if reference_image:
            result = service.generate_image_with_reference(
                prompt=prompt,
                reference_image_path=reference_image,
                grid_layout="single",
                aspect_ratio="1:1",
            )
        else:
            result = service.generate_image(
                prompt=prompt,
                grid_layout="single",
                aspect_ratio="1:1",
            )

        products_base = getattr(settings, 'products_dir', 'products')
        output_path = Path(products_base) / product_id / "instruction_board.png"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        saved = service.download_image(result["image_url"], str(output_path))

        product = db.get(Product, product_id)
        if product:
            product.instruction_board_path = saved
            product.instruction_board_status = "completed"
            db.commit()

    except Exception as e:
        import logging
        logging.getLogger(__name__).exception(
            "Instruction board generation failed for %s: %s", product_id, e
        )
        try:
            product = db.get(Product, product_id)
            if product:
                product.instruction_board_status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/{product_id}/generate-instruction-board")
def trigger_instruction_board(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    if not product.doc_json_path:
        raise HTTPException(400, "Product doc JSON not available yet")
    product.instruction_board_status = "generating"
    db.commit()
    threading.Thread(target=_generate_instruction_board, args=(product_id,), daemon=True).start()
    return {"ok": True}


@router.get("/{product_id}/instruction-board")
def get_instruction_board(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.instruction_board_path:
        raise HTTPException(404, "Instruction board not generated yet")
    path = Path(product.instruction_board_path)
    if not path.exists():
        raise HTTPException(404, "Instruction board file missing")
    return FileResponse(str(path))


@router.post("/{product_id}/generate-prompts")
def generate_prompts_for_product(product_id: str, body: dict, db: Session = Depends(get_db)):
    """Phase 2: Generate prompt variants using multiple templates (round-robin)."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    if not product.doc_json_path:
        raise HTTPException(400, "Product document not available")

    # template_key can be a single key or omitted for round-robin across all active templates
    template_key = body.get("template_key")

    # Load product doc
    import json
    from pathlib import Path
    doc_path = Path(product.doc_json_path)
    if not doc_path.exists():
        raise HTTPException(404, "Product document file not found")

    product_info = json.loads(doc_path.read_text(encoding="utf-8"))

    # Get active templates for round-robin
    active_templates = []
    if template_key:
        active_templates = [template_key]
    else:
        try:
            from app.models.template import VideoTemplate
            templates = db.query(VideoTemplate).filter(VideoTemplate.is_active == True).all()
            active_templates = [t.key for t in templates]
        except Exception:
            pass
        if not active_templates:
            active_templates = list(TEMPLATES.keys())

    _set_progress(product_id, scrape=100, doc=100, prompts=1, error=None)
    product.status = "analyzing"
    product.error_message = None
    db.commit()

    # Generate prompts in background
    def _generate_prompts_task(product_id: str, template_keys: list, product_info: dict):
        from app.database import SessionLocal
        from app.ai_models import get_model
        from app.models.config import ModelConfig as MC
        from app.services.prompt_generator import generate_prompt_variants, get_template
        import logging
        _logger = logging.getLogger(__name__)

        db_task: Session = SessionLocal()
        try:
            _set_progress(product_id, scrape=100, doc=100, prompts=5, error=None)
            cfg = db_task.query(MC).first() or MC()
            analysis_model = get_model(cfg.analysis_model, cfg)
            hook_options = []
            try:
                from app.models.template import HookTemplate
                hook_options = db_task.query(HookTemplate).filter(HookTemplate.is_active == True).order_by(HookTemplate.created_at).all()
            except Exception:
                hook_options = []

            def _resolve_generated_hook_key(variant: dict, index: int) -> str:
                raw = (
                    variant.get("hook_key")
                    or variant.get("hook_strategy_key")
                    or variant.get("hook_strategy")
                    or ""
                )
                normalized = str(raw).strip().lower()
                if hook_options:
                    matched = next(
                        (
                            hook for hook in hook_options
                            if normalized in {hook.key.lower(), hook.name.lower()}
                        ),
                        None,
                    )
                    if matched:
                        return matched.key
                    return hook_options[(index - 1) % len(hook_options)].key
                return normalized or "auto"

            def _fallback_variant(index: int, template_key: str, error: Exception) -> dict:
                template = get_template(template_key)
                title = product_info.get("title", "the product")
                appearance = product_info.get("appearance", "as shown in the reference images")
                usage = product_info.get("usage", "daily use")
                selling_points = product_info.get("selling_points", "clear product benefits")
                consistency = f"Preserve the exact design, color, and appearance of {title}: {appearance}"
                hook = f"Why are people switching to {title}?"
                content = (
                    "0-3s: Open with the product in a real-life scene and a quick problem statement. "
                    "3-8s: Demonstrate the main use case with close-up product handling. "
                    "8-12s: Highlight the strongest benefit with a simple before/after or proof moment. "
                    "12-15s: End with a concise recommendation and clear call to action."
                )
                try:
                    prompt_text = template["structure"].format(
                        hook=hook,
                        content=content,
                        consistency=consistency,
                    )
                except Exception as template_error:
                    _logger.warning(
                        "Template '%s' fallback structure failed, using plain fallback: %s",
                        template_key,
                        template_error,
                    )
                    prompt_text = (
                        "[Equipment] Shot with iPhone rear camera, natural product lighting\n"
                        f"[Video Style] TikTok product demo using the {template_key} angle\n"
                        "[Video Music] Clean upbeat social commerce background\n"
                        "[Video Effects] Fast cuts, close-ups, captions, proof moment\n"
                        f"[First 3 Seconds Hook] {hook}\n"
                        f"[Video Content] {content}\n"
                        f"[Product Consistency] {consistency}"
                    )
                prompt_text += (
                    f"\n[Product Context] Use case: {usage}. Key selling points: {selling_points}."
                )
                _logger.warning(
                    "Using fallback prompt for variant %d with template '%s' after generation error: %s",
                    index,
                    template_key,
                    error,
                )
                return {
                    "variant_index": index,
                    "template_key": template_key,
                    "hook_key": _resolve_generated_hook_key({}, index),
                    "full_prompt": prompt_text,
                }

            # Generate 10 variants, each with its own template (round-robin).
            # Do not leave gaps when a model call returns empty or malformed JSON.
            total = 10
            all_variants = []
            for i in range(total):
                assigned_template = template_keys[i % len(template_keys)]
                variant = None
                last_error: Exception | None = None
                for attempt in range(2):
                    try:
                        variants = generate_prompt_variants(
                            product_info, assigned_template, analysis_model, total_variants=1
                        )
                        if variants and variants[0].get("full_prompt"):
                            variant = variants[0]
                            break
                        last_error = RuntimeError("model returned no usable prompt")
                    except Exception as e:
                        last_error = e
                        _logger.warning(
                            "Failed to generate variant %d with template '%s' (attempt %d/2): %s",
                            i + 1,
                            assigned_template,
                            attempt + 1,
                            e,
                        )

                if variant is None:
                    variant = _fallback_variant(
                        i + 1,
                        assigned_template,
                        last_error or RuntimeError("unknown generation failure"),
                    )

                variant["variant_index"] = i + 1
                variant["template_key"] = assigned_template
                variant["hook_key"] = _resolve_generated_hook_key(variant, i + 1)
                all_variants.append(variant)
                _set_progress(product_id, prompts=min(95, 5 + int(((i + 1) / total) * 90)))
                _logger.info("Generated variant %d with template '%s'", i + 1, assigned_template)

            # Save to DB
            db_task.query(ProductPrompt).filter(ProductPrompt.product_id == product_id).delete()
            for v in all_variants:
                pp = ProductPrompt(
                    product_id=product_id,
                    template_name=v["template_key"],
                    variant_index=v.get("variant_index", 1),
                    prompt_text=v.get("full_prompt", ""),
                    image_prompt=v.get("image_prompt"),
                    video_style=v["template_key"],
                    hook_key=v.get("hook_key") or "auto",
                )
                db_task.add(pp)
            db_task.commit()
            _set_progress(product_id, prompts=100, error=None)
            product = db_task.get(Product, product_id)
            if product:
                product.status = "completed"
                product.error_message = None
                db_task.commit()

            _logger.info("Generated %d prompt variants for product %s", len(all_variants), product_id)
        except Exception as e:
            import traceback
            _logger.error("Prompt generation failed for product %s: %s\n%s", product_id, e, traceback.format_exc())
            _set_progress(product_id, error=str(e))
            product = db_task.get(Product, product_id)
            if product:
                product.status = "completed" if product.doc_json_path else "failed"
                product.error_message = str(e)
                db_task.commit()
        finally:
            db_task.close()

    threading.Thread(
        target=_generate_prompts_task,
        args=(product_id, active_templates, product_info),
        daemon=True
    ).start()

    return {"ok": True, "message": f"Generating prompts with {len(active_templates)} templates"}


@router.post("/{product_id}/generate-images")
def trigger_batch_image_generation(product_id: str, db: Session = Depends(get_db)):
    prompts = db.query(ProductPrompt).filter(ProductPrompt.product_id == product_id).all()
    if not prompts:
        raise HTTPException(404, "No prompts found for product")
    # Filter prompts that need image generation
    pending = [pp for pp in prompts if pp.image_status not in ("generating", "completed")]
    for pp in pending:
        pp.image_status = "generating"
    db.commit()

    # Run sequentially in a single background thread to avoid API rate limits
    def _batch_generate(prompt_ids: list[str]):
        import time
        for pid in prompt_ids:
            generate_image_for_prompt(pid)
            time.sleep(2)  # Small delay between requests

    if pending:
        threading.Thread(target=_batch_generate, args=([pp.id for pp in pending],), daemon=True).start()
    return {"ok": True, "count": len(pending)}
