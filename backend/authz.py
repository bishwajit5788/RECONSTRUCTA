"""RECONSTRUCTA authorization primitives.

Authorization consumes a principal established by the authentication layer.
No client-supplied owner identity is trusted.
"""
from fastapi import HTTPException, Request

from auth import principal_from_bearer
from database import db_manager


async def principal_from_request(request: Request) -> str:
    return await principal_from_bearer(request)


async def require_project_owner(request: Request, project_id: str) -> str:
    principal = await principal_from_request(request)
    project = await db_manager.get_collection("projects").find_one({"project_id": project_id})
    if not project or project.get("owner_session") != principal:
        raise HTTPException(status_code=403, detail="Project access denied")
    return principal


async def require_asset_owner(request: Request, object_id: str) -> str:
    principal = await principal_from_request(request)
    asset = await db_manager.get_collection("assets").find_one({"object_id": object_id})
    if not asset:
        raise HTTPException(status_code=403, detail="Asset access denied")
    project = await db_manager.get_collection("projects").find_one({"project_id": asset.get("project_id", "")})
    if not project or project.get("owner_session") != principal:
        raise HTTPException(status_code=403, detail="Asset access denied")
    return principal


def ensure_owner_not_forged(request: Request, supplied_owner: str | None, principal: str) -> str:
    if supplied_owner and supplied_owner != principal:
        raise HTTPException(status_code=403, detail="Owner identity cannot be forged")
    return principal
