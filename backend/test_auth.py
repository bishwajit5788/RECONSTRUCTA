import pytest

from auth import create_session_token, verify_session_token


def test_signed_session_round_trip(monkeypatch):
    monkeypatch.setenv("RECONSTRUCTA_AUTH_SECRET", "test-secret")
    token = create_session_token("user-123", ttl_seconds=60)
    assert verify_session_token(token) == "user-123"


def test_tampered_session_is_rejected(monkeypatch):
    monkeypatch.setenv("RECONSTRUCTA_AUTH_SECRET", "test-secret")
    token = create_session_token("user-123", ttl_seconds=60)
    encoded, signature = token.split(".", 1)
    assert verify_session_token(encoded + "x." + signature) is None


def test_missing_secret_fails_closed(monkeypatch):
    monkeypatch.delenv("RECONSTRUCTA_AUTH_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        create_session_token("user-123")
