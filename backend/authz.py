"""RECONSTRUCTA authorization primitives.

Authorization is deliberately separated from authentication. The current
principal adapter uses X-Session-ID so ownership enforcement can be tested now;
the authentication layer can replace that adapter later without changing the
project/asset authorization contract.
"""
from fastapi import HTTPException, Request
from database import db_manager

HEADER_NAME = "X-Session-ID"


def principal_from_request(request: Request) -> str:
    principal = request.headers.get(HEADER_NAME, "").strip()
    if not principal:
        raise HTTPException(status_code=401, detail="Authentication required")
    return principal


async def require_project_owner(request: Request, project_id: str) -> str:
    principal = principal_from_request(request)
    project = await db_manager.get_collection("projects").find_one({"project_id": project_id})
    if not project or project.get("owner_session") != principal:
        raise HTTPException(status_code=403, detail="Project access denied")
    return principal


async def require_asset_owner(request: Request, object_id: str) -> str:
    principal = principal_from_request(request)
    asset = await db_manager.get_collection("assets").find_one({"object_id": object_id})
    if not asset:
        raise HTTPException(status_code=403, detail="Asset access denied")
    return await require_project_owner(request, asset.get("project_id", ""))


def ensure_owner_not_forged(request: Request, supplied_owner: str | None) -> str:
    principal = principal_from_request(request)
    if supplied_owner and supplied_owner != principal:
        raise HTTPException(status_code=403, detail="Owner identity cannot be forged")
    return principal
