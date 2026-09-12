"""Production backend regression tests using real bearer authentication."""

import base64
import hashlib
import io
import os
import time
import zipfile

from fastapi.testclient import TestClient
from PIL import Image

from app import app
from storage import storage_manager

client = TestClient(app)
CREDS = {"username": "regression-user", "password": "Correct-Horse-Battery-9!"}
_registered = client.post("/api/auth/register", json=CREDS)
if _registered.status_code == 409:
    _registered = client.post("/api/auth/login", json=CREDS)
assert _registered.status_code == 200, _registered.text
_auth = _registered.json()
OWNER = _auth["user_id"]
HEADERS = {"Authorization": f"Bearer {_auth['access_token']}"}
os.environ["RECONSTRUCTA_ADMIN_SESSION"] = OWNER


def create_sample_image_base64(width=100, height=100, color=(120, 50, 180)):
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def create_project(project_id):
    response = client.post("/api/projects", json={"project_id": project_id, "owner_session": OWNER, "name": "Test Project"}, headers=HEADERS)
    assert response.status_code == 200, response.text
    return project_id


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "opencv_version" in data
    assert data["mode"] == "production_hardened"
    assert data["retention_hours"] == 2
    assert data["retention_seconds"] == 7200


def test_inpaint_with_quality_scoring():
    response = client.post("/api/inpaint", json={"image_data": create_sample_image_base64(120, 80), "bounds": {"x": 20, "y": 20, "width": 40, "height": 20}, "algorithm": "telea", "inpaint_radius": 3})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["algorithm_used"] == "opencv_telea"
    assert data["restored_image_data"].startswith("data:image/png;base64,")
    assert 0.0 <= data["quality_score"] <= 1.0
    assert data["quality_label"] in {"excellent", "good", "acceptable", "poor", "failed"}
    assert isinstance(data["warnings"], list)
    assert data["processing_time_ms"] > 0


def test_inpaint_ns_with_quality_metrics():
    response = client.post("/api/inpaint", json={"image_data": create_sample_image_base64(), "bounds": {"x": 10, "y": 10, "width": 30, "height": 30}, "algorithm": "ns"})
    assert response.status_code == 200
    data = response.json()
    assert data["algorithm_used"] == "opencv_ns"
    assert 0.0 <= data["quality_score"] <= 1.0


def test_inpaint_invalid_bounds():
    response = client.post("/api/inpaint", json={"image_data": create_sample_image_base64(50, 50), "bounds": {"x": 200, "y": 200, "width": 20, "height": 20}, "algorithm": "telea"})
    assert response.status_code == 400


def test_r2_file_upload_download_delete_lifecycle():
    project_id = create_project("proj_test_123")
    sample_content = b"RECONSTRUCTA_TEST_BINARY_PAYLOAD_PNG"
    response = client.post("/api/files/upload", headers=HEADERS, files={"file": ("test_render.png", io.BytesIO(sample_content), "image/png")}, data={"project_id": project_id, "purpose": "uploads"})
    assert response.status_code == 200, response.text
    data = response.json()
    object_id = data["object_id"]
    assert data["project_id"] == project_id
    assert data["size_bytes"] == len(sample_content)
    assert data["expires_at"] > time.time()
    downloaded = client.get(f"/api/files/{object_id}", headers=HEADERS)
    assert downloaded.status_code == 200
    assert downloaded.content == sample_content
    assert downloaded.headers["Content-Type"] == "image/png"
    assert "max-age" in downloaded.headers["Cache-Control"]
    deleted = client.delete(f"/api/files/{object_id}", headers=HEADERS)
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert client.get(f"/api/files/{object_id}", headers=HEADERS).status_code == 403


def test_mongodb_project_metadata_and_touch():
    project_id = f"proj_{time.time_ns()}"
    response = client.post("/api/projects", headers=HEADERS, json={"project_id": project_id, "owner_session": OWNER, "name": "Luxury Test Project", "platform": "generic", "schema_version": 1, "canvas_width": 1080, "canvas_height": 1920, "node_count": 12})
    assert response.status_code == 200
    initial_expiry = response.json()["expires_at"]
    assert initial_expiry > time.time()
    fetched = client.get(f"/api/projects/{project_id}", headers=HEADERS)
    assert fetched.status_code == 200
    assert fetched.json()["project_id"] == project_id
    assert fetched.json()["name"] == "Luxury Test Project"
    touched = client.post(f"/api/projects/{project_id}/touch", headers=HEADERS)
    assert touched.status_code == 200
    assert touched.json()["expires_at"] >= initial_expiry
    assert client.delete(f"/api/projects/{project_id}", headers=HEADERS).status_code == 200


def test_two_hour_retention_purge():
    project_id = create_project(f"expired_proj_{time.time_ns()}")
    meta = storage_manager.upload_file(data=b"EXPIRED_DATA", project_id=project_id, purpose="working", content_type="text/plain", ttl_seconds=-10)
    response = client.post("/api/cleanup/purge-expired", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["purged"]["files"] >= 1
    assert client.get(f"/api/files/{meta.object_id}", headers=HEADERS).status_code == 403


def test_readiness_probe():
    response = client.get("/api/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["database_healthy"] is True
    assert data["storage_healthy"] is True


def test_x_request_id_and_observability():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert len(response.headers["x-request-id"]) > 10


def test_magic_bytes_rejection():
    project_id = create_project(f"magic_{time.time_ns()}")
    response = client.post("/api/files/upload", headers=HEADERS, files={"file": ("malicious.exe", io.BytesIO(b"\x00\x01\x02\x03CORRUPTED"), "application/octet-stream")}, data={"project_id": project_id, "purpose": "uploads"})
    assert response.status_code == 400
    assert "Invalid file signature" in response.json()["detail"]


def test_zip_bomb_detection():
    project_id = create_project(f"zip_{time.time_ns()}")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("huge_zeroes.txt", b"\x00" * (1024 * 1024))
    response = client.post("/api/files/upload", headers=HEADERS, files={"file": ("malicious.docx", io.BytesIO(buf.getvalue()), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}, data={"project_id": project_id, "purpose": "uploads"})
    assert response.status_code == 400
    assert "File rejected" in response.json()["detail"]


def test_restart_lifecycle_adversarial():
    project_id = create_project(f"restart_{time.time_ns()}")
    img = Image.new("RGB", (64, 64), (255, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()
    expected_sha256 = hashlib.sha256(png_bytes).hexdigest()
    response = client.post("/api/files/upload", headers=HEADERS, files={"file": ("screen_snap.png", io.BytesIO(png_bytes), "image/png")}, data={"project_id": project_id, "purpose": "uploads"})
    assert response.status_code == 200, response.text
    object_id = response.json()["object_id"]
    assert response.json()["sha256"] == expected_sha256
    downloaded = client.get(f"/api/files/{object_id}", headers=HEADERS)
    assert downloaded.status_code == 200
    assert downloaded.content == png_bytes
    assert downloaded.headers["x-sha256"] == expected_sha256
    touched = client.post(f"/api/projects/{project_id}/touch", headers=HEADERS)
    assert touched.status_code == 200
    assert touched.json()["expires_at"] > time.time()
    assert client.delete(f"/api/files/{object_id}", headers=HEADERS).status_code == 200
    assert client.get(f"/api/files/{object_id}", headers=HEADERS).status_code == 403
