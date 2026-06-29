from fastapi.testclient import TestClient
from unittest.mock import patch


def get_test_client():
    """Create a test client with fresh database tables."""
    from app.database import Base, engine
    from app.models.product_prompt import ProductPrompt  # noqa: F401
    # Drop and recreate to pick up any schema changes
    ProductPrompt.__table__.drop(engine, checkfirst=True)
    Base.metadata.create_all(bind=engine)
    from main import app
    return TestClient(app)


def test_trigger_batch_video_generation():
    client = get_test_client()
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p"})
    pid = create_resp.json()["id"]

    # Insert a prompt so the batch endpoint finds something
    from app.database import SessionLocal
    from app.models.product_prompt import ProductPrompt
    db = SessionLocal()
    pp = ProductPrompt(product_id=pid, prompt_text="test prompt")
    db.add(pp)
    db.commit()
    db.close()

    with patch("app.api.products.threading"):
        resp = client.post(f"/api/products/{pid}/generate-videos")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["count"] == 1


def test_batch_video_no_prompts_returns_404():
    client = get_test_client()
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p2"})
    pid = create_resp.json()["id"]
    resp = client.post(f"/api/products/{pid}/generate-videos")
    assert resp.status_code == 404
