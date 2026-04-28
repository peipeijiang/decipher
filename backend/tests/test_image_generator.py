import pytest
from app.services.image_generator import ImageGeneratorService


def test_image_generator_initialization():
    service = ImageGeneratorService(api_key="test_key")
    assert service.api_key == "test_key"
    assert "Bearer test_key" in service.headers["Authorization"]


def test_image_generator_headers():
    service = ImageGeneratorService(api_key="sk-test-123")
    assert service.headers["Content-Type"] == "application/json"
    assert service.headers["Authorization"] == "Bearer sk-test-123"
