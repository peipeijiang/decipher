import pytest
from app.services.video_generator import VideoGeneratorService


def test_video_generator_initialization():
    service = VideoGeneratorService(api_key="test_key")
    assert service.api_key == "test_key"
    assert "Bearer test_key" in service.headers["Authorization"]


def test_video_generator_headers():
    service = VideoGeneratorService(api_key="vk-test-456")
    assert service.headers["Content-Type"] == "application/json"
    assert service.headers["Authorization"] == "Bearer vk-test-456"
