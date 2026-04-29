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
)

router = APIRouter(prefix="/api/products", tags=["products"])


@router.post("/create", response_model=ProductOut)
def create_product(body: ProductCreate, db: Session = Depends(get_db)):
    product = Product(url=body.url)
    db.add(product)
    db.commit()
    db.refresh(product)
    threading.Thread(target=run_product_pipeline, args=(product.id,), daemon=True).start()
    return product


@router.get("", response_model=list[ProductOut])
def list_products(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Product).order_by(Product.created_at.desc())
    if status:
        q = q.filter(Product.status == status)
    return q.all()


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@router.get("/{product_id}/progress")
def get_progress(product_id: str):
    return get_product_progress(product_id)


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
def trigger_image_generation(prompt_id: str, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")
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
    if not pp or not pp.video_url:
        raise HTTPException(404, "Generated video not found")
    return {"video_url": pp.video_url, "status": pp.video_status}


@router.patch("/prompts/{prompt_id}", response_model=ProductPromptOut)
def update_prompt(prompt_id: str, body: dict, db: Session = Depends(get_db)):
    pp = db.get(ProductPrompt, prompt_id)
    if not pp:
        raise HTTPException(404, "Prompt not found")
    if "prompt_text" in body:
        pp.prompt_text = body["prompt_text"]
    db.commit()
    db.refresh(pp)
    return pp
