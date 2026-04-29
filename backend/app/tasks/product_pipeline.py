"""Background pipeline: scrape → analyze → generate prompts."""
import logging
from pathlib import Path
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.product import Product
from app.models.product_prompt import ProductPrompt
from app.models.config import ModelConfig

logger = logging.getLogger(__name__)

# In-memory progress: product_id → {scrape, doc, prompts, error}
_progress: dict[str, dict] = {}


def get_product_progress(product_id: str) -> dict:
    return _progress.get(product_id, {"scrape": 0, "doc": 0, "prompts": 0, "error": None})


def _set_progress(product_id: str, error: str | None = None, **kwargs: int) -> None:
    if product_id not in _progress:
        _progress[product_id] = {"scrape": 0, "doc": 0, "prompts": 0, "error": None}
    _progress[product_id].update(kwargs)
    if error is not None:
        _progress[product_id]["error"] = error


def run_product_pipeline(product_id: str):
    """Full pipeline: scrape → analyze images → generate doc → generate prompts."""
    db: Session = SessionLocal()
    try:
        product = db.get(Product, product_id)
        if not product:
            return

        product.status = "scraping"
        db.commit()
        _set_progress(product_id, scrape=0, doc=0, prompts=0)

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
        image_results = analyze_product_images(image_paths, vision_model)
        _set_progress(product_id, doc=60)

        # Step 3: Generate product document
        product_info = generate_product_doc(
            product.title, product.description, image_results, analysis_model,
        )
        md_path, json_path = write_product_docs(str(product_dir), product_info, image_results)
        product.doc_path = md_path
        product.doc_json_path = json_path
        db.commit()
        _set_progress(product_id, doc=100)

        # Step 4: Generate 10 prompt variants
        _set_progress(product_id, prompts=10)
        from app.services.prompt_generator import generate_prompt_variants

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

        pp.image_status = "generating"
        db.commit()

        from app.services.image_generator import ImageGeneratorService

        # Read from DB config_json first, fallback to .env settings
        cfg = db.query(ModelConfig).first()
        providers = cfg.get_providers() if cfg else {}
        api_key = providers.get("_laozhang_api_key") or getattr(settings, 'laozhang_api_key', '')
        if not api_key:
            raise RuntimeError("laozhang_api_key not configured")

        # Get selected image model from config
        image_model = cfg.image_model if cfg else "laozhang-image-2-vip"

        service = ImageGeneratorService(api_key=api_key)

        # Generate image with selected model
        result = service.generate_image(prompt=pp.prompt_text, model=image_model)

        # Download and save
        products_base = getattr(settings, 'products_dir', 'products')
        output_dir = Path(products_base) / product.id / "generated"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"prompt_{pp.variant_index}_image.jpg"

        saved = service.download_image(result["image_url"], str(output_path))
        pp.image_path = saved
        pp.image_url = result["image_url"]
        pp.image_status = "completed"
        db.commit()

    except Exception as e:
        logger.exception("Image generation failed for prompt %s: %s", prompt_id, e)
        try:
            pp = db.get(ProductPrompt, prompt_id)
            if pp:
                pp.image_status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def generate_video_for_prompt(prompt_id: str):
    """Generate a video for a single prompt using SeedDance 2.0."""
    db: Session = SessionLocal()
    try:
        pp = db.get(ProductPrompt, prompt_id)
        if not pp:
            return
        product = db.get(Product, pp.product_id)
        if not product:
            return

        pp.video_status = "generating"
        db.commit()

        from app.services.video_generator import VideoGeneratorService

        # Read from DB config_json first, fallback to .env settings
        cfg = db.query(ModelConfig).first()
        providers = cfg.get_providers() if cfg else {}

        # Get selected video model from config
        video_model = cfg.video_gen_model if cfg else "seedance-2.0"

        # Choose API key and endpoint based on model
        if video_model == "happyhorse-1.0":
            api_key = providers.get("_aliyun_api_key") or getattr(settings, 'aliyun_api_key', '')
            base_url = "https://dashscope.aliyuncs.com/api/v1"
        else:  # seedance-2.0
            api_key = providers.get("_volcengine_api_key") or getattr(settings, 'volcengine_api_key', '')
            base_url = "https://ark.cn-beijing.volces.com/api/v3"

        if not api_key:
            raise RuntimeError(f"API key not configured for {video_model}")

        service = VideoGeneratorService(api_key=api_key, base_url=base_url)

        # Use generated image as input (if available), otherwise use first product image
        if pp.image_url:
            image_url = pp.image_url
        else:
            # Fallback to first product image
            images_dir = Path(product.images_dir)
            ref_images = sorted(images_dir.glob("image_*")) if images_dir.exists() else []
            if not ref_images:
                raise RuntimeError("No images available for video generation")
            # For local files, we'd need to upload them first - for now, skip
            raise RuntimeError("Video generation requires a generated image first")

        result = service.generate_video(
            image_url=image_url,
            prompt=pp.prompt_text,
            model=video_model,
        )

        if result["status"] == "completed":
            pp.video_url = result.get("video_url", "")
            pp.video_status = "completed"

            # Optionally download video
            if pp.video_url:
                products_base = getattr(settings, 'products_dir', 'products')
                output_dir = Path(products_base) / product.id / "videos"
                output_dir.mkdir(parents=True, exist_ok=True)
                output_path = output_dir / f"prompt_{pp.variant_index}_video.mp4"
                saved = service.download_video(pp.video_url, str(output_path))
                pp.video_path = saved
        else:
            pp.video_status = "failed"

        db.commit()

    except Exception as e:
        logger.exception("Video generation failed for prompt %s: %s", prompt_id, e)
        try:
            pp = db.get(ProductPrompt, prompt_id)
            if pp:
                pp.video_status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
