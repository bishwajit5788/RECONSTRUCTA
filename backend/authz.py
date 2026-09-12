"""RECONSTRUCTA authorization primitives.

Authorization is intentionally separated from authentication.  The current API
uses an authenticated-principal adapter (X-Session-ID) so route enforcement can
be tested now; the authentication layer can later replace that adapter without
changing ownership checks.
"""
from fastapi import HTTPException, Request


HEADER_NAME = "X-Session-ID"


def principal_from_request(request: Request) -> str:
    principal = request.headers.get(HEADER_NAME, "").strip()
    if not principal:
        raise HTTPException(status_code=401, detail="Authentication required")
    return principal


async def require_project_owner(request: Request, project_id: str) -> str:
    principal = principal_from_request(request)
    projects = request.app.state.db_manager.get_collection("projects")
    project = await projects.find_one({"project_id": project_id})
    if not project or project.get("owner_session") != principal:
        # Deliberately use 403 for both missing and foreign resources to reduce
        # project enumeration through ownership-protected routes.
        raise HTTPException(status_code=403, detail="Project access denied")
    return principal


async def require_asset_owner(request: Request, object_id: str) -> str:
    principal = principal_from_request(request)
    assets = request.app.state.db_manager.get_collection("assets")
    asset = await assets.find_one({"object_id": object_id})
    if not asset:
        raise HTTPException(status_code=403, detail="Asset access denied")
    return await require_project_owner(request, asset.get("project_id", ""))


def ensure_owner_not_forged(request: Request, supplied_owner: str | None) -> str:
    principal = principal_from_request(request)
    if supplied_owner and supplied_owner != principal:
        raise HTTPException(status_code=403, detail="Owner identity cannot be forged")
    return principal
