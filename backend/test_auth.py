import uuid

from fastapi.testclient import TestClient

from app import app

client = TestClient(app)


def credentials():
    return {"username": f"user-{uuid.uuid4().hex[:16]}", "password": "Correct-Horse-Battery-9!"}


def test_register_returns_bearer_token_and_me():
    creds = credentials()
    response = client.post("/api/auth/register", json=creds)
    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["expires_at"] > 0
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == creds["username"]


def test_login_rejects_wrong_password_and_accepts_correct_password():
    creds = credentials()
    assert client.post("/api/auth/register", json=creds).status_code == 200
    assert client.post("/api/auth/login", json={**creds, "password": "Wrong-password-123!"}).status_code == 401
    response = client.post("/api/auth/login", json=creds)
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_tampered_or_missing_bearer_is_rejected():
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer invalid-token"}).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401


def test_logout_revokes_session():
    creds = credentials()
    token = client.post("/api/auth/register", json=creds).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_password_policy_is_enforced():
    response = client.post("/api/auth/register", json={"username": "ab", "password": "short"})
    assert response.status_code == 422
    response = client.post("/api/auth/register", json={"username": "valid-user", "password": "short"})
    assert response.status_code == 422
