"""Product API integration tests."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


def get_test_client():
    """Create a test client with fresh database."""
    from app.database import Base, engine
    Base.metadata.create_all(bind=engine)
    from main import app
    return TestClient(app)


def test_create_product():
    client = get_test_client()
    with patch("app.api.products.threading") as mock_thread:
        resp = client.post("/api/products/create", json={"url": "https://example.com/product"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] == "https://example.com/product"
        assert data["status"] == "pending"
        assert "id" in data


def test_list_products():
    client = get_test_client()
    with patch("app.api.products.threading"):
        client.post("/api/products/create", json={"url": "https://example.com/p1"})
        client.post("/api/products/create", json={"url": "https://example.com/p2"})
    resp = client.get("/api/products")
    assert resp.status_code == 200
    products = resp.json()
    assert len(products) >= 2


def test_get_product():
    client = get_test_client()
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p"})
    pid = create_resp.json()["id"]
    resp = client.get(f"/api/products/{pid}")
    assert resp.status_code == 200
    assert resp.json()["id"] == pid


def test_get_product_not_found():
    client = get_test_client()
    resp = client.get("/api/products/nonexistent-id")
    assert resp.status_code == 404


def test_delete_product():
    client = get_test_client()
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p"})
    pid = create_resp.json()["id"]
    with patch("app.config.settings") as mock_settings:
        mock_settings.products_dir = "/tmp/products"
        with patch("pathlib.Path.exists", return_value=False):
            resp = client.delete(f"/api/products/{pid}")
    assert resp.status_code == 200
    get_resp = client.get(f"/api/products/{pid}")
    assert get_resp.status_code == 404


def test_get_progress():
    client = get_test_client()
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p"})
    pid = create_resp.json()["id"]
    resp = client.get(f"/api/products/{pid}/progress")
    assert resp.status_code == 200
    data = resp.json()
    assert "scrape" in data
    assert "doc" in data
    assert "prompts" in data
