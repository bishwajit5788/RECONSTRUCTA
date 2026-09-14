"""RECONSTRUCTA local authentication.

Credentials are verified with PBKDF2-HMAC-SHA256. Successful login creates an
opaque random bearer token; only a SHA-256 hash of that token is persisted.
Sessions are short-lived and revocable, and every protected request resolves
the principal from the server-side session record.
"""
import hashlib
import hmac
import os
import re
import secrets
import time
from typing import Any, Optional

from fastapi import HTTPException, Request

from database import db_manager

SESSION_TTL_SECONDS = int(os.environ.get("RECONSTRUCTA_SESSION_TTL", "3600"))
PBKDF2_ITERATIONS = int(os.environ.get("RECONSTRUCTA_PBKDF2_ITERATIONS", "600000"))
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,64}$")


def _password_hash(password: str, salt: bytes) -> str:
    derived = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return derived.hex()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${_password_hash(password, salt)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt_hex, expected = encoded.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations)).hex()
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def validate_credentials(username: str, password: str) -> None:
    if not USERNAME_RE.fullmatch(username):
        raise HTTPException(status_code=422, detail="Username must be 3-64 characters using letters, numbers, ., _, or -")
    if len(password) < 12 or len(password) > 256:
        raise HTTPException(status_code=422, detail="Password must be 12-256 characters")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_user(username: str, password: str) -> str:
    username = username.strip()
    validate_credentials(username, password)
    users = db_manager.get_collection("users")
    if await users.find_one({"username": username.lower()}):
        raise HTTPException(status_code=409, detail="Username already exists")
    user_id = secrets.token_urlsafe(18)
    await users.insert_one({
        "user_id": user_id,
        "username": username.lower(),
        "password_hash": hash_password(password),
        "created_at": time.time(),
    })
    return user_id


async def authenticate_user(username: str, password: str) -> dict[str, Any]:
    username = username.strip().lower()
    user = await db_manager.get_collection("users").find_one({"username": username})
    if not user or not verify_password(password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password", headers={"WWW-Authenticate": "Bearer"})
    return user


async def create_session(user: dict[str, Any]) -> tuple[str, float]:
    token = secrets.token_urlsafe(48)
    expires_at = time.time() + SESSION_TTL_SECONDS
    await db_manager.get_collection("sessions").insert_one({
        "session_id": secrets.token_urlsafe(18),
        "token_hash": _token_hash(token),
        "user_id": user["user_id"],
        "username": user["username"],
        "created_at": time.time(),
        "expires_at": expires_at,
    })
    return token, expires_at


async def principal_from_bearer(request: Request) -> str:
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Bearer authentication required", headers={"WWW-Authenticate": "Bearer"})
    session = await db_manager.get_collection("sessions").find_one({"token_hash": _token_hash(token.strip())})
    if not session or session.get("expires_at", 0) <= time.time():
        raise HTTPException(status_code=401, detail="Session expired or revoked", headers={"WWW-Authenticate": "Bearer"})
    return session["user_id"]


async def revoke_session(request: Request) -> None:
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Bearer authentication required", headers={"WWW-Authenticate": "Bearer"})
    result = await db_manager.get_collection("sessions").delete_one({"token_hash": _token_hash(token.strip())})
    if getattr(result, "deleted_count", 0) != 1:
        raise HTTPException(status_code=401, detail="Invalid session", headers={"WWW-Authenticate": "Bearer"})
