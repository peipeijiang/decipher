"""Template management API routes."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.template import VideoTemplate, ImageLayoutTemplate, HookTemplate


router = APIRouter(prefix="/api/templates", tags=["templates"])


# Schemas
class VideoTemplateCreate(BaseModel):
    key: str
    name: str
    structure: str
    is_active: bool = True


class VideoTemplateUpdate(BaseModel):
    name: str | None = None
    structure: str | None = None
    has_builtin_hook: bool | None = None
    is_active: bool | None = None


class VideoTemplateOut(BaseModel):
    id: str
    key: str
    name: str
    structure: str
    has_builtin_hook: bool = False
    is_custom: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ImageLayoutTemplateCreate(BaseModel):
    key: str
    name: str
    prompt_template: str
    is_active: bool = True


class ImageLayoutTemplateUpdate(BaseModel):
    name: str | None = None
    prompt_template: str | None = None
    is_active: bool | None = None


class ImageLayoutTemplateOut(BaseModel):
    id: str
    key: str
    name: str
    prompt_template: str
    is_custom: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# Video Template Routes

@router.get("/video", response_model=list[VideoTemplateOut])
def list_video_templates(active_only: bool = False, db: Session = Depends(get_db)):
    """Get all video templates."""
    query = db.query(VideoTemplate)
    if active_only:
        query = query.filter(VideoTemplate.is_active == True)
    return query.order_by(VideoTemplate.created_at).all()


@router.get("/video/{template_id}", response_model=VideoTemplateOut)
def get_video_template(template_id: str, db: Session = Depends(get_db)):
    """Get a specific video template."""
    template = db.get(VideoTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.post("/video", response_model=VideoTemplateOut)
def create_video_template(body: VideoTemplateCreate, db: Session = Depends(get_db)):
    """Create a new video template."""
    # Check if key already exists
    existing = db.query(VideoTemplate).filter(VideoTemplate.key == body.key).first()
    if existing:
        raise HTTPException(400, f"Template with key '{body.key}' already exists")

    template = VideoTemplate(
        key=body.key,
        name=body.name,
        structure=body.structure,
        is_custom=True,
        is_active=body.is_active,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.patch("/video/{template_id}", response_model=VideoTemplateOut)
def update_video_template(template_id: str, body: VideoTemplateUpdate, db: Session = Depends(get_db)):
    """Update a video template."""
    template = db.get(VideoTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    # Built-in templates can only toggle is_active and has_builtin_hook
    if not template.is_custom:
        if body.is_active is not None:
            template.is_active = body.is_active
        if body.has_builtin_hook is not None:
            template.has_builtin_hook = body.has_builtin_hook
        if body.is_active is None and body.has_builtin_hook is None:
            raise HTTPException(400, "Built-in templates can only be enabled/disabled")
    else:
        # Custom templates can be fully edited
        if body.name is not None:
            template.name = body.name
        if body.structure is not None:
            template.structure = body.structure
        if body.is_active is not None:
            template.is_active = body.is_active
        if body.has_builtin_hook is not None:
            template.has_builtin_hook = body.has_builtin_hook

    db.commit()
    db.refresh(template)
    return template


@router.delete("/video/{template_id}")
def delete_video_template(template_id: str, db: Session = Depends(get_db)):
    """Delete a video template (custom only)."""
    template = db.get(VideoTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    if not template.is_custom:
        raise HTTPException(400, "Cannot delete built-in templates")

    db.delete(template)
    db.commit()
    return {"ok": True}


# Image Layout Template Routes

@router.get("/image-layout", response_model=list[ImageLayoutTemplateOut])
def list_image_layout_templates(active_only: bool = False, db: Session = Depends(get_db)):
    """Get all image layout templates."""
    query = db.query(ImageLayoutTemplate)
    if active_only:
        query = query.filter(ImageLayoutTemplate.is_active == True)
    return query.order_by(ImageLayoutTemplate.created_at).all()


@router.get("/image-layout/{template_id}", response_model=ImageLayoutTemplateOut)
def get_image_layout_template(template_id: str, db: Session = Depends(get_db)):
    """Get a specific image layout template."""
    template = db.get(ImageLayoutTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.post("/image-layout", response_model=ImageLayoutTemplateOut)
def create_image_layout_template(body: ImageLayoutTemplateCreate, db: Session = Depends(get_db)):
    """Create a new image layout template."""
    # Check if key already exists
    existing = db.query(ImageLayoutTemplate).filter(ImageLayoutTemplate.key == body.key).first()
    if existing:
        raise HTTPException(400, f"Template with key '{body.key}' already exists")

    template = ImageLayoutTemplate(
        key=body.key,
        name=body.name,
        prompt_template=body.prompt_template,
        is_custom=True,
        is_active=body.is_active,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.patch("/image-layout/{template_id}", response_model=ImageLayoutTemplateOut)
def update_image_layout_template(template_id: str, body: ImageLayoutTemplateUpdate, db: Session = Depends(get_db)):
    """Update an image layout template."""
    template = db.get(ImageLayoutTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    # Built-in templates: allow editing prompt_template + name + is_active
    if not template.is_custom:
        if body.prompt_template is not None:
            template.prompt_template = body.prompt_template
        if body.name is not None:
            template.name = body.name
        if body.is_active is not None:
            template.is_active = body.is_active
    else:
        # Custom templates can be fully edited
        if body.name is not None:
            template.name = body.name
        if body.prompt_template is not None:
            template.prompt_template = body.prompt_template
        if body.is_active is not None:
            template.is_active = body.is_active

    db.commit()
    db.refresh(template)
    return template


@router.delete("/image-layout/{template_id}")
def delete_image_layout_template(template_id: str, db: Session = Depends(get_db)):
    """Delete an image layout template (custom only)."""
    template = db.get(ImageLayoutTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    if not template.is_custom:
        raise HTTPException(400, "Cannot delete built-in templates")

    db.delete(template)
    db.commit()
    return {"ok": True}


# Hook Template Schemas

class HookTemplateCreate(BaseModel):
    key: str
    name: str
    description: str
    examples: str  # JSON array string


class HookTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    examples: str | None = None
    is_active: bool | None = None


class HookTemplateOut(BaseModel):
    id: str
    key: str
    name: str
    description: str
    examples: str
    is_custom: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# Hook Template Routes

@router.get("/hook", response_model=list[HookTemplateOut])
def list_hook_templates(active_only: bool = False, db: Session = Depends(get_db)):
    """Get all hook templates."""
    query = db.query(HookTemplate)
    if active_only:
        query = query.filter(HookTemplate.is_active == True)
    return query.order_by(HookTemplate.created_at).all()


@router.get("/hook/{template_id}", response_model=HookTemplateOut)
def get_hook_template(template_id: str, db: Session = Depends(get_db)):
    """Get a specific hook template."""
    template = db.get(HookTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@router.post("/hook", response_model=HookTemplateOut)
def create_hook_template(body: HookTemplateCreate, db: Session = Depends(get_db)):
    """Create a new hook template."""
    existing = db.query(HookTemplate).filter(HookTemplate.key == body.key).first()
    if existing:
        raise HTTPException(400, f"Template with key '{body.key}' already exists")

    template = HookTemplate(
        key=body.key,
        name=body.name,
        description=body.description,
        examples=body.examples,
        is_custom=True,
        is_active=True,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.patch("/hook/{template_id}", response_model=HookTemplateOut)
def update_hook_template(template_id: str, body: HookTemplateUpdate, db: Session = Depends(get_db)):
    """Update a hook template."""
    template = db.get(HookTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    # Built-in templates: allow editing prompt_template + name + is_active
    if not template.is_custom:
        if body.prompt_template is not None:
            template.prompt_template = body.prompt_template
        if body.name is not None:
            template.name = body.name
        if body.is_active is not None:
            template.is_active = body.is_active
    else:
        if body.name is not None:
            template.name = body.name
        if body.description is not None:
            template.description = body.description
        if body.examples is not None:
            template.examples = body.examples
        if body.is_active is not None:
            template.is_active = body.is_active

    db.commit()
    db.refresh(template)
    return template


@router.delete("/hook/{template_id}")
def delete_hook_template(template_id: str, db: Session = Depends(get_db)):
    """Delete a hook template (custom only)."""
    template = db.get(HookTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    if not template.is_custom:
        raise HTTPException(400, "Cannot delete built-in templates")

    db.delete(template)
    db.commit()
    return {"ok": True}

