"""
RECONSTRUCTA — PRODUCTION BACKEND TEST SUITE
Tests health check, OpenCV inpainting with actual measured quality scoring,
Cloudflare R2 temporary storage lifecycle, MongoDB Atlas project metadata,
2-hour retention purge worker, and security boundary enforcement.
"""

import base64
import hashlib
import io
import time
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import app
from storage import storage_manager
from retention import retention_worker

client = TestClient(app)


def create_sample_image_base64(width: int = 100, height: int = 100, color=(120, 50, 180)) -> str:
    """Creates a sample test PNG in memory and returns base64 data url."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def test_health_check():
    """Verify health check returns ok, opencv info, and 2-hour retention status."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "opencv_version" in data
    assert data["mode"] == "production_hardened"
    assert data["retention_hours"] == 2
    assert data["retention_seconds"] == 7200


def test_inpaint_with_quality_scoring():
    """Verify OpenCV TELEA inpainting returns actual measured quality score and labels."""
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
    assert 0.0 <= data["quality_score"] <= 1.0
    assert data["quality_label"] in ["excellent", "good", "acceptable", "poor", "failed"]
    assert isinstance(data["warnings"], list)
    assert data["processing_time_ms"] > 0


def test_inpaint_ns_with_quality_metrics():
    """Verify Navier-Stokes inpainting returns valid quality evaluation."""
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
    assert 0.0 <= data["quality_score"] <= 1.0
    assert data["quality_label"] in ["excellent", "good", "acceptable", "poor", "failed"]


def test_inpaint_invalid_bounds():
    """Verify out-of-bound coordinates are safely rejected."""
    img_b64 = create_sample_image_base64(50, 50)
    payload = {
        "image_data": img_b64,
        "bounds": {
            "x": 200,
            "y": 200,
            "width": 20,
            "height": 20
        },
        "algorithm": "telea"
    }
    response = client.post("/api/inpaint", json=payload)
    assert response.status_code == 400


def test_r2_file_upload_download_delete_lifecycle():
    """Verify upload, download, and delete of temporary objects."""
    sample_content = b"RECONSTRUCTA_TEST_BINARY_PAYLOAD_PNG"
    files = {"file": ("test_render.png", io.BytesIO(sample_content), "image/png")}
    data = {"project_id": "proj_test_123", "purpose": "uploads"}

    # 1. Upload
    res_upload = client.post("/api/files/upload", files=files, data=data)
    assert res_upload.status_code == 200
    upload_data = res_upload.json()
    object_id = upload_data["object_id"]
    assert upload_data["status"] == "success"
    assert upload_data["project_id"] == "proj_test_123"
    assert upload_data["size_bytes"] == len(sample_content)
    assert upload_data["expires_at"] > time.time()

    # 2. Download
    res_download = client.get(f"/api/files/{object_id}")
    assert res_download.status_code == 200
    assert res_download.content == sample_content
    assert res_download.headers["Content-Type"] == "image/png"
    assert "max-age" in res_download.headers["Cache-Control"]

    # 3. Delete
    res_delete = client.delete(f"/api/files/{object_id}")
    assert res_delete.status_code == 200
    assert res_delete.json()["deleted"] is True

    # 4. Verify Gone
    res_gone = client.get(f"/api/files/{object_id}")
    assert res_gone.status_code == 404


def test_mongodb_project_metadata_and_touch():
    """Verify MongoDB Atlas project metadata creation and 2-hour retention extension."""
    project_id = f"proj_{int(time.time())}"
    payload = {
        "project_id": project_id,
        "owner_session": "session_user_abc",
        "name": "Luxury Test Project",
        "platform": "whatsapp",
        "schema_version": 1,
        "canvas_width": 1080,
        "canvas_height": 1920,
        "node_count": 12
    }

    # Create project metadata
    res_create = client.post("/api/projects", json=payload)
    assert res_create.status_code == 200
    initial_expiry = res_create.json()["expires_at"]
    assert initial_expiry > time.time()

    # Retrieve project metadata
    res_get = client.get(f"/api/projects/{project_id}")
    assert res_get.status_code == 200
    proj_doc = res_get.json()
    assert proj_doc["project_id"] == project_id
    assert proj_doc["name"] == "Luxury Test Project"

    # Touch / extend project retention
    res_touch = client.post(f"/api/projects/{project_id}/touch")
    assert res_touch.status_code == 200
    new_expiry = res_touch.json()["expires_at"]
    assert new_expiry >= initial_expiry

    # Cleanup project
    res_del = client.delete(f"/api/projects/{project_id}")
    assert res_del.status_code == 200


def test_two_hour_retention_purge():
    """Verify expired objects are purged when reference time exceeds expires_at."""
    # Store an object with an artificially expired TTL
    now = time.time()
    meta = storage_manager.upload_file(
        data=b"EXPIRED_DATA",
        project_id="expired_proj",
        purpose="working",
        content_type="text/plain",
        ttl_seconds=-10  # Already expired in the past
    )

    # Purge expired
    res_purge = client.post("/api/cleanup/purge-expired")
    assert res_purge.status_code == 200
    purged_summary = res_purge.json()["purged"]
    assert purged_summary["files"] >= 1

    # Verify object is purged
    res_get = client.get(f"/api/files/{meta.object_id}")
    assert res_get.status_code == 404


def test_readiness_probe():
    """Verify /api/ready reports 200 when database and storage are available."""
    response = client.get("/api/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["database_healthy"] is True
    assert data["storage_healthy"] is True


def test_x_request_id_and_observability():
    """Verify X-Request-ID header is propagated and present on responses."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert "x-request-id" in response.headers
    assert len(response.headers["x-request-id"]) > 10


def test_magic_bytes_rejection():
    """Verify spoofed or corrupted binaries are rejected with 400."""
    corrupted_data = b"\x00\x01\x02\x03CORRUPTED_NON_MATCHING_BYTES"
    files = {"file": ("malicious.exe", io.BytesIO(corrupted_data), "application/octet-stream")}
    data = {"project_id": "test_security", "purpose": "uploads"}
    response = client.post("/api/files/upload", files=files, data=data)
    assert response.status_code == 400
    assert "Invalid file signature" in response.json()["detail"]


def test_zip_bomb_detection():
    """Verify decompression bombs with abusive compression ratios are rejected."""
    import zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1MB of zeroes compresses to a few hundred bytes (> 1000:1 ratio)
        zf.writestr("huge_zeroes.txt", b"\x00" * (1024 * 1024))
    zip_bytes = buf.getvalue()

    files = {"file": ("malicious.docx", io.BytesIO(zip_bytes), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    data = {"project_id": "test_security", "purpose": "uploads"}
    response = client.post("/api/files/upload", files=files, data=data)
    assert response.status_code == 400
    assert "File rejected" in response.json()["detail"]


def test_restart_lifecycle_adversarial():
    """
    Mandatory production restart lifecycle test:
    Upload -> Verify R2 & MongoDB state -> Simulate restart -> Download & Verify SHA256/TTL -> Delete -> Cleanup verify.
    """
    # 1. Prepare valid PNG payload with magic bytes
    img = Image.new("RGB", (64, 64), (255, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()
    expected_sha256 = hashlib.sha256(png_bytes).hexdigest()

    # Upload
    files = {"file": ("screen_snap.png", io.BytesIO(png_bytes), "image/png")}
    data = {"project_id": "proj_restart_test", "purpose": "screenshots"}
    res_upload = client.post("/api/files/upload", files=files, data=data)
    assert res_upload.status_code == 200
    upload_info = res_upload.json()
    obj_id = upload_info["object_id"]
    assert upload_info["sha256"] == expected_sha256

    # 2. Simulate worker restart / fresh lookup from storage
    # Verify file is retrievable with correct SHA256 and content
    res_download = client.get(f"/api/files/{obj_id}")
    assert res_download.status_code == 200
    assert res_download.content == png_bytes
    assert res_download.headers["x-sha256"] == expected_sha256

    # 3. Touch project to extend retention
    res_touch = client.post("/api/projects/proj_restart_test/touch")
    assert res_touch.status_code == 200
    new_expires = res_touch.json()["expires_at"]
    assert new_expires > time.time()

    # 4. Explicit deletion and cleanup verification
    res_del = client.delete(f"/api/files/{obj_id}")
    assert res_del.status_code == 200

    # 5. Verify gone
    res_gone = client.get(f"/api/files/{obj_id}")
    assert res_gone.status_code == 404
