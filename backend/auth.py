"""RECONSTRUCTA authentication primitives.

This module intentionally does not persist passwords. It provides short-lived,
HMAC-signed session tokens suitable for an API gateway or a future identity
provider. Production deployments should place a real OIDC provider in front of
this service and set RECONSTRUCTA_AUTH_SECRET.
"""

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional

TOKEN_TTL_SECONDS = 3600
_AUTH_SECRET = os.environ.get("RECONSTRUCTA_AUTH_SECRET", "")


def _secret() -> bytes:
    if not _AUTH_SECRET:
        raise RuntimeError("RECONSTRUCTA_AUTH_SECRET is not configured")
    return _AUTH_SECRET.encode("utf-8")


def create_session_token(subject: str, ttl_seconds: int = TOKEN_TTL_SECONDS) -> str:
    if not subject or ttl_seconds <= 0:
        raise ValueError("Invalid session token parameters")
    payload = {"sub": subject, "iat": int(time.time()), "exp": int(time.time()) + ttl_seconds}
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(_secret(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def verify_session_token(token: str) -> Optional[str]:
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(_secret(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        padded = encoded + "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        if int(payload.get("exp", 0)) <= int(time.time()):
            return None
        subject = payload.get("sub")
        return subject if isinstance(subject, str) and subject else None
    except (ValueError, TypeError, KeyError, json.JSONDecodeError, UnicodeDecodeError):
        return None
