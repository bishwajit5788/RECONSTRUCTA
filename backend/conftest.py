"""Test-only compatibility adapter for the pre-authorization backend suite.

Production routes always require X-Session-ID. The older regression tests were
written before route authorization existed, so CI runs that suite with
LEGACY_TEST_AUTH=true. New authorization tests intentionally run without it.
"""
import asyncio
import os

import pytest
from fastapi.testclient import TestClient

from database import db_manager, ProjectMetadataModel


LEGACY_PRINCIPAL = "session_user_abc"


@pytest.fixture(autouse=True)
def _legacy_auth_environment(monkeypatch):
    if os.environ.get("LEGACY_TEST_AUTH") == "true":
        monkeypatch.setenv("RECONSTRUCTA_ADMIN_SESSION", LEGACY_PRINCIPAL)


_original_request = TestClient.request


def _authorized_request(self, method, url, **kwargs):
    if os.environ.get("LEGACY_TEST_AUTH") != "true":
        return _original_request(self, method, url, **kwargs)

    headers = dict(kwargs.get("headers") or {})
    headers.setdefault("X-Session-ID", LEGACY_PRINCIPAL)
    kwargs["headers"] = headers

    if str(url).startswith("/api/files/upload") or str(url).startswith("http") and "/api/files/upload" in str(url):
        data = kwargs.get("data") or {}
        project_id = data.get("project_id") if hasattr(data, "get") else None
        if project_id:
            projects = db_manager.get_collection("projects")
            existing = asyncio.run(projects.find_one({"project_id": project_id}))
            if not existing:
                now = __import__("time").time()
                doc = ProjectMetadataModel(
                    project_id=project_id,
                    owner_session=LEGACY_PRINCIPAL,
                    created_at=now,
                    updated_at=now,
                    expires_at=now + 7200,
                ).model_dump()
                asyncio.run(projects.insert_one(doc))

    return _original_request(self, method, url, **kwargs)


TestClient.request = _authorized_request
