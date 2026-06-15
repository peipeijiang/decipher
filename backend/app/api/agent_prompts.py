"""Agent Prompt management API routes."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.agent_prompt import AgentPrompt

router = APIRouter(prefix="/api/agent-prompts", tags=["agent-prompts"])


class AgentPromptOut(BaseModel):
    id: str
    key: str
    name: str
    description: str
    system_prompt: str
    user_prompt_template: str
    variables: str
    input_fields: str = "[]"
    output_fields: str = "[]"
    is_custom: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentPromptUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    input_fields: str | None = None
    output_fields: str | None = None
    is_active: bool | None = None


class AgentPromptCreate(BaseModel):
    key: str
    name: str
    description: str = ""
    system_prompt: str
    user_prompt_template: str = ""
    variables: str = "[]"


@router.get("", response_model=list[AgentPromptOut])
def list_agent_prompts(db: Session = Depends(get_db)):
    return db.query(AgentPrompt).order_by(AgentPrompt.created_at).all()


@router.get("/{agent_id}", response_model=AgentPromptOut)
def get_agent_prompt_detail(agent_id: str, db: Session = Depends(get_db)):
    ap = db.get(AgentPrompt, agent_id)
    if not ap:
        raise HTTPException(404, "Agent prompt not found")
    return ap


@router.patch("/{agent_id}", response_model=AgentPromptOut)
def update_agent_prompt(agent_id: str, body: AgentPromptUpdate, db: Session = Depends(get_db)):
    ap = db.get(AgentPrompt, agent_id)
    if not ap:
        raise HTTPException(404, "Agent prompt not found")

    if body.system_prompt is not None:
        ap.system_prompt = body.system_prompt
    if body.user_prompt_template is not None:
        ap.user_prompt_template = body.user_prompt_template
    if body.name is not None and ap.is_custom:
        ap.name = body.name
    if body.description is not None:
        ap.description = body.description
    if body.input_fields is not None:
        ap.input_fields = body.input_fields
    if body.output_fields is not None:
        ap.output_fields = body.output_fields
    if body.is_active is not None:
        ap.is_active = body.is_active

    ap.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ap)
    return ap


@router.post("", response_model=AgentPromptOut)
def create_agent_prompt(body: AgentPromptCreate, db: Session = Depends(get_db)):
    existing = db.query(AgentPrompt).filter(AgentPrompt.key == body.key).first()
    if existing:
        raise HTTPException(400, f"Agent prompt with key '{body.key}' already exists")

    ap = AgentPrompt(
        key=body.key,
        name=body.name,
        description=body.description,
        system_prompt=body.system_prompt,
        user_prompt_template=body.user_prompt_template,
        variables=body.variables,
        is_custom=True,
        is_active=True,
    )
    db.add(ap)
    db.commit()
    db.refresh(ap)
    return ap


@router.delete("/{agent_id}")
def delete_agent_prompt(agent_id: str, db: Session = Depends(get_db)):
    ap = db.get(AgentPrompt, agent_id)
    if not ap:
        raise HTTPException(404, "Agent prompt not found")
    if not ap.is_custom:
        raise HTTPException(400, "Cannot delete built-in agent prompts")
    db.delete(ap)
    db.commit()
    return {"ok": True}


@router.post("/{agent_id}/reset", response_model=AgentPromptOut)
def reset_agent_prompt(agent_id: str, db: Session = Depends(get_db)):
    """Reset a built-in agent prompt to its default value."""
    ap = db.get(AgentPrompt, agent_id)
    if not ap:
        raise HTTPException(404, "Agent prompt not found")
    if ap.is_custom:
        raise HTTPException(400, "Only built-in agent prompts can be reset")

    # Import defaults from migration
    from migrations.add_agent_prompts import DEFAULTS
    default = next((d for d in DEFAULTS if d["key"] == ap.key), None)
    if not default:
        raise HTTPException(500, "Default not found for this agent")

    ap.system_prompt = default["system_prompt"]
    ap.user_prompt_template = default["user_prompt_template"]
    ap.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ap)
    return ap


# Utility function for pipeline use
def get_agent_prompt(db: Session, key: str) -> tuple[str, str]:
    """Get agent prompt from DB. Returns (system_prompt, user_prompt_template).
    Falls back to empty strings if not found."""
    ap = db.query(AgentPrompt).filter(AgentPrompt.key == key, AgentPrompt.is_active == True).first()
    if ap:
        return ap.system_prompt, ap.user_prompt_template
    return "", ""
