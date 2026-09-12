"""RECONSTRUCTA authorization primitives."""
from fastapi import HTTPException
from database import db_manager


async def require_project_owner(project_id: str, subject: str) -> dict:
    if not project_id or not subject:
        raise HTTPException(status_code=403, detail="Project access denied.")
    project = await db_manager.get_collection("projects").find_one({"project_id": project_id})
    if not project or project.get("owner_session") != subject:
        raise HTTPException(status_code=403, detail="Project access denied.")
    return project


async def require_asset_owner(object_id: str, subject: str) -> dict:
    if not object_id or not subject:
        raise HTTPException(status_code=403, detail="Asset access denied.")
    asset = await db_manager.get_collection("assets").find_one({"object_id": object_id})
    if not asset:
        raise HTTPException(status_code=403, detail="Asset access denied.")
    await require_project_owner(asset.get("project_id", ""), subject)
    return asset
