"""
RECONSTRUCTA — BACKEND TEST SUITE
Tests health check, OpenCV inpainting endpoint, error handling, and payload security.
"""

import base64
import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app import app

client = TestClient(app)

def create_sample_image_base64(width: int = 100, height: int = 100, color=(120, 50, 180)) -> str:
    """Creates a sample test PNG in memory and returns base64 data url."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"

def test_health_check():
    """Verify health check returns ok and opencv info."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "opencv_version" in data
    assert data["mode"] == "backend_hybrid"

def test_inpaint_telea_success():
    """Verify OpenCV TELEA inpainting produces valid restored image."""
    img_b64 = create_sample_image_base64(120, 80)
    payload = {
        "image_data": img_b64,
        "bounds": {
            "x": 20,
            "y": 20,
            "width": 40,
            "height": 20
        },
        "algorithm": "telea",
        "inpaint_radius": 3
    }
    response = client.post("/api/inpaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["algorithm_used"] == "opencv_telea"
    assert data["restored_image_data"].startswith("data:image/png;base64,")
    assert data["processing_time_ms"] > 0

def test_inpaint_ns_success():
    """Verify OpenCV Navier-Stokes inpainting executes cleanly."""
    img_b64 = create_sample_image_base64(100, 100)
    payload = {
        "image_data": img_b64,
        "bounds": {
            "x": 10,
            "y": 10,
            "width": 30,
            "height": 30
        },
        "algorithm": "ns"
    }
    response = client.post("/api/inpaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["algorithm_used"] == "opencv_ns"

def test_inpaint_invalid_bounds():
    """Verify out-of-bound coordinates are safely rejected."""
    img_b64 = create_sample_image_base64(50, 50)
    payload = {
        "image_data": img_b64,
        "bounds": {
            "x": 200,  # Exceeds width of 50
            "y": 200,
            "width": 20,
            "height": 20
        },
        "algorithm": "telea"
    }
    response = client.post("/api/inpaint", json=payload)
    assert response.status_code == 400
