from fastapi.testclient import TestClient
from unittest.mock import patch


def test_archive_product():
    from main import app
    client = TestClient(app)
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p"})
    pid = create_resp.json()["id"]
    resp = client.patch(f"/api/products/{pid}/archive")
    assert resp.status_code == 200
    assert resp.json()["archive_status"] == "archived"


def test_activate_product():
    from main import app
    client = TestClient(app)
    with patch("app.api.products.threading"):
        create_resp = client.post("/api/products/create", json={"url": "https://example.com/p2"})
    pid = create_resp.json()["id"]
    client.patch(f"/api/products/{pid}/archive")
    resp = client.patch(f"/api/products/{pid}/activate")
    assert resp.status_code == 200
    assert resp.json()["archive_status"] == "active"


def test_list_products_filters_archived():
    from main import app
    client = TestClient(app)
    with patch("app.api.products.threading"):
        create_resp1 = client.post("/api/products/create", json={"url": "https://example.com/p3"})
        create_resp2 = client.post("/api/products/create", json={"url": "https://example.com/p4"})
    pid1 = create_resp1.json()["id"]
    pid2 = create_resp2.json()["id"]

    # Archive one product
    client.patch(f"/api/products/{pid1}/archive")

    # Default list should only show active
    resp = client.get("/api/products")
    assert resp.status_code == 200
    active_ids = [p["id"] for p in resp.json()]
    assert pid2 in active_ids
    assert pid1 not in active_ids

    # Query archived products
    resp = client.get("/api/products?archive_status=archived")
    assert resp.status_code == 200
    archived_ids = [p["id"] for p in resp.json()]
    assert pid1 in archived_ids
    assert pid2 not in archived_ids

