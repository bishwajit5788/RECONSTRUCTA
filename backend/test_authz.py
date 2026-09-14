import asyncio
import uuid

from fastapi.testclient import TestClient

from app import app
from database import db_manager, AssetMetadataModel

client = TestClient(app)


def register(username: str) -> dict:
    password = "Correct-Horse-Battery-9!"
    response = client.post("/api/auth/register", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def project_payload(project_id: str, owner_session: str | None = None):
    payload = {"project_id": project_id, "name": "Authorization Test Project"}
    if owner_session is not None:
        payload["owner_session"] = owner_session
    return payload


def test_two_user_project_isolation():
    project_id = f"authz-{uuid.uuid4()}"
    alice = register(f"alice-{uuid.uuid4().hex[:12]}")
    bob = register(f"bob-{uuid.uuid4().hex[:12]}")
    assert client.post("/api/projects", json=project_payload(project_id), headers=alice).status_code == 200
    assert client.get(f"/api/projects/{project_id}", headers=alice).status_code == 200
    assert client.get(f"/api/projects/{project_id}", headers=bob).status_code == 403
    assert client.post(f"/api/projects/{project_id}/touch", headers=bob).status_code == 403
    assert client.delete(f"/api/projects/{project_id}", headers=bob).status_code == 403
    response = client.post("/api/files/upload", headers=bob, files={"file": ("x.png", b"not-an-image", "image/png")}, data={"project_id": project_id, "purpose": "uploads"})
    assert response.status_code == 403


def test_owner_identity_cannot_be_forged():
    project_id = f"authz-{uuid.uuid4()}"
    alice = register(f"alice-{uuid.uuid4().hex[:12]}")
    bob = register(f"bob-{uuid.uuid4().hex[:12]}")
    response = client.post("/api/projects", json=project_payload(project_id, owner_session="forged-owner"), headers=alice)
    assert response.status_code == 403
    assert client.post("/api/projects", json=project_payload(project_id), headers=bob).status_code == 200


def test_missing_identity_is_rejected():
    project_id = f"authz-{uuid.uuid4()}"
    response = client.post("/api/projects", json=project_payload(project_id))
    assert response.status_code == 401


def test_asset_isolation_follows_project_owner():
    project_id = f"authz-{uuid.uuid4()}"
    object_id = f"asset-{uuid.uuid4()}"
    alice = register(f"alice-{uuid.uuid4().hex[:12]}")
    bob = register(f"bob-{uuid.uuid4().hex[:12]}")
    assert client.post("/api/projects", json=project_payload(project_id), headers=alice).status_code == 200
    asset_doc = AssetMetadataModel(object_id=object_id, project_id=project_id, content_type="image/png", size_bytes=4, sha256="0" * 64, expires_at=9999999999).model_dump()
    asyncio.run(db_manager.get_collection("assets").insert_one(asset_doc))
    assert client.get(f"/api/files/{object_id}", headers=bob).status_code == 403
    assert client.delete(f"/api/files/{object_id}", headers=bob).status_code == 403
    assert client.get(f"/api/files/{object_id}", headers=alice).status_code in (404, 500)
