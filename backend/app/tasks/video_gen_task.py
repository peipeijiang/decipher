"""Background task for standalone video generation."""
import logging
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.video_generation import VideoGeneration
from app.models.config import ModelConfig

logger = logging.getLogger(__name__)


def run_video_generation(gen_id: str):
    """Generate a video for a standalone VideoGeneration record."""
    db: Session = SessionLocal()
    try:
        gen = db.get(VideoGeneration, gen_id)
        if not gen:
            return

        gen.status = "generating"
        db.commit()

        cfg = db.query(ModelConfig).first() or ModelConfig()
        providers = cfg.get_providers() if cfg else {}

        # Determine image source
        image_url = None
        local_image_path = gen.reference_image if gen.reference_image and Path(gen.reference_image).exists() else None

        # Route to appropriate backend
        duration = gen.duration or 5
        model = gen.model or "seedance-2.0"

        from app.tasks.product_pipeline import (
            _generate_video_volcengine,
            _generate_video_veo,
            _generate_video_aliyun,
        )

        if model == "veo-3.1":
            result = _generate_video_veo(gen.prompt, image_url, providers, duration=duration, local_image_path=local_image_path)
        elif model in ["happyhorse-1.0", "wan-2.6"]:
            result = _generate_video_aliyun(gen.prompt, image_url, providers, model_name=model, duration=duration, local_image_path=local_image_path)
        else:
            result = _generate_video_volcengine(gen.prompt, image_url, providers, duration=duration, local_image_path=local_image_path)

        if result["status"] == "completed":
            gen.video_url = result.get("video_url", "")
            gen.status = "completed"
            gen.completed_at = datetime.utcnow()

            # Download video locally
            if gen.video_url:
                import requests
                output_dir = Path("video_gen_outputs")
                output_dir.mkdir(parents=True, exist_ok=True)
                output_path = output_dir / f"{gen_id}.mp4"
                response = requests.get(gen.video_url, timeout=60)
                response.raise_for_status()
                with open(output_path, "wb") as f:
                    f.write(response.content)
                gen.video_path = str(output_path)
        else:
            gen.status = "failed"
            gen.error_message = "Video generation returned non-completed status"

        db.commit()

    except Exception as e:
        logger.exception("Video generation failed for %s: %s", gen_id, e)
        try:
            gen = db.get(VideoGeneration, gen_id)
            if gen:
                gen.status = "failed"
                gen.error_message = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
