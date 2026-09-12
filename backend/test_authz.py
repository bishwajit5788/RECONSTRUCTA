import os
import pytest

os.environ["LOCAL_DEV_STORAGE"] = "true"

from database import db_manager
from authz import require_project_owner, require_asset_owner
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_project_owner_can_access_and_other_subject_is_denied():
    projects = db_manager.get_collection("projects")
    await projects.insert_one({"project_id": "p-owner", "owner_session": "user-a"})

    assert (await require_project_owner("p-owner", "user-a"))["project_id"] == "p-owner"
    with pytest.raises(HTTPException) as exc:
        await require_project_owner("p-owner", "user-b")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_asset_access_is_scoped_through_project_owner():
    projects = db_manager.get_collection("projects")
    assets = db_manager.get_collection("assets")
    await projects.insert_one({"project_id": "p-asset", "owner_session": "user-a"})
    await assets.insert_one({"object_id": "asset-a", "project_id": "p-asset"})

    assert (await require_asset_owner("asset-a", "user-a"))["object_id"] == "asset-a"
    with pytest.raises(HTTPException) as exc:
        await require_asset_owner("asset-a", "user-b")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_missing_project_or_asset_fails_closed():
    with pytest.raises(HTTPException) as exc:
        await require_project_owner("missing", "user-a")
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException) as exc:
        await require_asset_owner("missing", "user-a")
    assert exc.value.status_code == 403
