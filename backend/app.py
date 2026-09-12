"""RECONSTRUCTA production FastAPI backend with project/asset authorization."""
import base64
import io
import logging
import os
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Dict, List, Literal, Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image

from auth import authenticate_user, create_session, create_user, revoke_session
from authz import ensure_owner_not_forged, principal_from_request, require_asset_owner, require_project_owner
from database import db_manager, ProjectMetadataModel, AssetMetadataModel
from storage import (
    storage_manager,
    StoredObjectMetadata,
    MAX_FILE_SIZE_BYTES,
    validate_magic_bytes,
    check_zip_bomb,
    LOCAL_DEV_STORAGE,
)
from retention import retention_worker, RETENTION_WINDOW_SECONDS

logger = logging.getLogger("reconstructa.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db_manager.initialize()
    retention_worker.start()
    yield
    await retention_worker.stop()
    await db_manager.close()


app = FastAPI(
    title="RECONSTRUCTA Production Backend Service",
    description="Secure visual reconstruction backend with real credential authentication and ownership enforcement.",
    version="2.2.0",
    lifespan=lifespan,
)

cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
allowed_origins = [x.strip() for x in cors_origins_env.split(",") if x.strip()] if cors_origins_env != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

_rate_limits: Dict[str, List[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60.0
RATE_LIMIT_MAX_REQUESTS = 180


@app.middleware("http")
async def observability_and_rate_limit_middleware(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    start_time = time.time()
    client_ip = request.client.host if request.client else "127.0.0.1"
    now = time.time()
    timestamps = [t for t in _rate_limits[client_ip] if now - t < RATE_LIMIT_WINDOW]
    if len(timestamps) >= RATE_LIMIT_MAX_REQUESTS:
        return Response(content='{"detail":"Rate limit exceeded. Try again later."}', status_code=429, media_type="application/json", headers={"X-Request-ID": req_id})
    timestamps.append(now)
    _rate_limits[client_ip] = timestamps
    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    logger.info("REQ %s | %s %s -> %s (%.2fms)", req_id, request.method, request.url.path, response.status_code, (time.time() - start_time) * 1000)
    return response


class BoundingBoxModel(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class InpaintRequest(BaseModel):
    image_data: str
    bounds: BoundingBoxModel
    algorithm: Literal["telea", "ns"] = "telea"
    inpaint_radius: int = Field(default=3, ge=1, le=15)


class InpaintResponse(BaseModel):
    status: str
    algorithm_used: str
    restored_image_data: str
    quality_score: float
    quality_label: Literal["excellent", "good", "acceptable", "poor", "failed"]
    warnings: List[str]
    processing_time_ms: float


class ProjectCreateRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=128)
    owner_session: Optional[str] = Field(default=None, max_length=256)
    name: str = Field(default="Untitled Reconstruction", max_length=256)
    platform: str = Field(default="generic", max_length=64)
    schema_version: int = 1
    canvas_width: int = Field(default=1080, gt=0, le=20000)
    canvas_height: int = Field(default=1920, gt=0, le=20000)
    node_count: int = Field(default=0, ge=0)


class CredentialRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: float
    user_id: str
    username: str


def calculate_inpaint_quality(original_bgr: np.ndarray, restored_bgr: np.ndarray, mask: np.ndarray, bounds: BoundingBoxModel):
    warnings: List[str] = []
    h, w, _ = original_bgr.shape
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    dilated_mask = cv2.dilate(mask, kernel, iterations=1)
    boundary_ring = cv2.bitwise_xor(dilated_mask, mask)
    orig_gray = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2GRAY)
    rest_gray = cv2.cvtColor(restored_bgr, cv2.COLOR_BGR2GRAY)
    lap_orig = cv2.Laplacian(orig_gray, cv2.CV_32F)
    lap_rest = cv2.Laplacian(rest_gray, cv2.CV_32F)
    boundary_pixels = boundary_ring > 0
    mean_grad_error = float(np.mean(np.abs(lap_orig[boundary_pixels] - lap_rest[boundary_pixels]))) if np.any(boundary_pixels) else 0.0
    mean_color_diff = float(np.mean(np.abs(original_bgr[boundary_pixels].astype(np.float32) - restored_bgr[boundary_pixels].astype(np.float32)))) if np.any(boundary_pixels) else 0.0
    bx, by, bw, bh = bounds.x, bounds.y, bounds.width, bounds.height
    safe_w, safe_h = min(bw, w - bx), min(bh, h - by)
    patch = rest_gray[by:by + safe_h, bx:bx + safe_w]
    restored_var = float(np.var(patch)) if patch.size else 100.0
    mask_area_ratio = (bw * bh) / (w * h)
    score = float(np.clip(round(1.0 - min(0.35, mean_grad_error / 80.0) - min(0.35, mean_color_diff / 50.0) - min(0.20, mask_area_ratio * 0.8), 2), 0.10, 0.99))
    label = "excellent" if score >= 0.90 else "good" if score >= 0.75 else "acceptable" if score >= 0.60 else "poor" if score >= 0.40 else "failed"
    if mean_grad_error > 25: warnings.append("Perimeter gradient discontinuity detected.")
    if mean_color_diff > 18: warnings.append("Perimeter color transition deviates from background context.")
    if mask_area_ratio > 0.15: warnings.append("Large inpainting area; structural smoothing may be perceptible.")
    if restored_var < 5 and mean_grad_error > 15: warnings.append("Flat region synthesized inside high-frequency context.")
    return score, label, warnings


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "RECONSTRUCTA Production Engine", "mode": "production_hardened", "opencv_version": cv2.__version__, "mongodb_connected": db_manager.is_connected, "mongodb_fallback": db_manager.is_fallback, "r2_active": storage_manager.is_r2_active, "retention_hours": 2, "retention_seconds": RETENTION_WINDOW_SECONDS, "timestamp": time.time()}


@app.get("/api/ready")
async def readiness_check():
    db_ok = db_manager.is_healthy
    storage_ok = storage_manager.is_r2_active or LOCAL_DEV_STORAGE
    if not db_ok or not storage_ok:
        raise HTTPException(status_code=503, detail={"status": "degraded", "database_healthy": db_ok, "storage_healthy": storage_ok, "local_dev_mode": LOCAL_DEV_STORAGE})
    return {"status": "ready", "database_healthy": True, "storage_healthy": True, "local_dev_mode": LOCAL_DEV_STORAGE, "timestamp": time.time()}


@app.post("/api/auth/register", response_model=AuthResponse)
async def register(request: CredentialRequest):
    user_id = await create_user(request.username, request.password)
    user = {"user_id": user_id, "username": request.username.strip().lower()}
    token, expires_at = await create_session(user)
    return AuthResponse(access_token=token, expires_at=expires_at, user_id=user_id, username=user["username"])


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(request: CredentialRequest):
    user = await authenticate_user(request.username, request.password)
    token, expires_at = await create_session(user)
    return AuthResponse(access_token=token, expires_at=expires_at, user_id=user["user_id"], username=user["username"])


@app.post("/api/auth/logout")
async def logout(request: Request):
    await revoke_session(request)
    return {"status": "success"}


@app.get("/api/auth/me")
async def current_user(request: Request):
    principal = await principal_from_request(request)
    user = await db_manager.get_collection("users").find_one({"user_id": principal})
    if not user:
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists")
    return {"user_id": user["user_id"], "username": user["username"]}


@app.post("/api/inpaint", response_model=InpaintResponse)
async def inpaint_region(req: InpaintRequest):
    start_time = time.time()
    try:
        _, encoded = req.image_data.split(",", 1) if "," in req.image_data else ("", req.image_data)
        raw_bytes = base64.b64decode(encoded, validate=True)
        if len(raw_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="Payload exceeds 50MB security limit.")
        img_bgr = cv2.cvtColor(np.array(Image.open(io.BytesIO(raw_bytes)).convert("RGB")), cv2.COLOR_RGB2BGR)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image payload provided.")
    h, w, _ = img_bgr.shape
    if h * w > 16_777_216:
        raise HTTPException(status_code=400, detail="Image exceeds maximum allowable pixel dimensions (16MP).")
    bx, by, bw, bh = req.bounds.x, req.bounds.y, req.bounds.width, req.bounds.height
    if bx >= w or by >= h:
        raise HTTPException(status_code=400, detail="Bounding box coordinates are out of image bounds.")
    safe_w, safe_h = min(bw, w - bx), min(bh, h - by)
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[by:by + safe_h, bx:bx + safe_w] = 255
    try:
        flag = cv2.INPAINT_TELEA if req.algorithm == "telea" else cv2.INPAINT_NS
        restored_bgr = cv2.inpaint(img_bgr, mask, req.inpaint_radius, flag)
    except Exception:
        raise HTTPException(status_code=500, detail="OpenCV inpainting restoration failed.")
    score, label, warnings = calculate_inpaint_quality(img_bgr, restored_bgr, mask, req.bounds)
    out = io.BytesIO()
    Image.fromarray(cv2.cvtColor(restored_bgr, cv2.COLOR_BGR2RGB)).save(out, format="PNG")
    return InpaintResponse(status="success", algorithm_used=f"opencv_{req.algorithm}", restored_image_data=f"data:image/png;base64,{base64.b64encode(out.getvalue()).decode()}", quality_score=score, quality_label=label, warnings=warnings, processing_time_ms=round((time.time() - start_time) * 1000, 2))


@app.post("/api/projects")
async def save_project_metadata(req: ProjectCreateRequest, request: Request):
    principal = await principal_from_request(request)
    ensure_owner_not_forged(request, req.owner_session, principal)
    projects = db_manager.get_collection("projects")
    existing = await projects.find_one({"project_id": req.project_id})
    now = time.time()
    expires_at = now + RETENTION_WINDOW_SECONDS
    if existing and existing.get("owner_session") != principal:
        raise HTTPException(status_code=403, detail="Project access denied")
    created_at = existing.get("created_at", now) if existing else now
    doc = ProjectMetadataModel(project_id=req.project_id, owner_session=principal, name=req.name, platform=req.platform, schema_version=req.schema_version, canvas_width=req.canvas_width, canvas_height=req.canvas_height, node_count=req.node_count, created_at=created_at, updated_at=now, expires_at=expires_at).model_dump()
    await projects.update_one({"project_id": req.project_id}, {"$set": doc}, upsert=True)
    return {"status": "success", "project_id": req.project_id, "expires_at": expires_at}


@app.get("/api/projects/{project_id}")
async def get_project_metadata(project_id: str, request: Request):
    await require_project_owner(request, project_id)
    return await db_manager.get_collection("projects").find_one({"project_id": project_id})


@app.post("/api/projects/{project_id}/touch")
async def touch_project(project_id: str, request: Request):
    await require_project_owner(request, project_id)
    new_expiry = await retention_worker.extend_project_retention(project_id)
    return {"status": "success", "project_id": project_id, "expires_at": new_expiry}


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, request: Request):
    await require_project_owner(request, project_id)
    assets_col = db_manager.get_collection("assets")
    cursor = assets_col.find({"project_id": project_id})
    assets = await cursor.to_list(1000)
    for asset in assets:
        object_id = asset.get("object_id")
        if object_id:
            storage_manager.delete_file(object_id)
    await assets_col.delete_many({"project_id": project_id})
    await db_manager.get_collection("projects").delete_one({"project_id": project_id})
    return {"status": "success", "project_id": project_id}


@app.post("/api/files/upload")
async def upload_temporary_file(request: Request, file: UploadFile = File(...), project_id: str = Form(...), purpose: str = Form("uploads")):
    await require_project_owner(request, project_id)
    if purpose not in {"uploads", "working", "exports"}:
        raise HTTPException(status_code=400, detail="Invalid storage purpose")
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 50MB security limit.")
    valid, detected_mime = validate_magic_bytes(file_bytes)
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid file signature or unsupported binary type.")
    filename_lower = (file.filename or "").lower()
    if detected_mime == "application/zip" or filename_lower.endswith((".docx", ".pptx", ".zip")):
        safe_zip, reason = check_zip_bomb(file_bytes)
        if not safe_zip:
            raise HTTPException(status_code=400, detail=f"File rejected: {reason}")
    content_type = detected_mime if detected_mime != "application/octet-stream" else (file.content_type or "application/octet-stream")
    meta: StoredObjectMetadata = storage_manager.upload_file(file_bytes, project_id, purpose, content_type, RETENTION_WINDOW_SECONDS)
    await db_manager.get_collection("assets").insert_one(AssetMetadataModel(object_id=meta.object_id, project_id=project_id, purpose=meta.purpose, content_type=meta.content_type, size_bytes=meta.size, sha256=meta.sha256, created_at=meta.created_at, expires_at=meta.expires_at).model_dump())
    return {"status":"success","object_id":meta.object_id,"project_id":meta.project_id,"purpose":meta.purpose,"content_type":meta.content_type,"size_bytes":meta.size,"sha256":meta.sha256,"expires_at":meta.expires_at}


@app.get("/api/files/{object_id}")
async def download_temporary_file(object_id: str, request: Request):
    await require_asset_owner(request, object_id)
    result = storage_manager.download_file(object_id)
    if not result:
        raise HTTPException(status_code=404, detail="File not found or expired under 2-hour retention.")
    file_bytes, meta = result
    remaining_seconds = max(0, int(meta.expires_at - time.time()))
    return Response(content=file_bytes, media_type=meta.content_type, headers={"Cache-Control": f"private, no-transform, max-age={remaining_seconds}", "X-Expires-At": str(meta.expires_at), "X-SHA256": meta.sha256})


@app.delete("/api/files/{object_id}")
async def delete_temporary_file(object_id: str, request: Request):
    await require_asset_owner(request, object_id)
    deleted = storage_manager.delete_file(object_id)
    await db_manager.get_collection("assets").delete_one({"object_id": object_id})
    return {"status":"success","object_id":object_id,"deleted":deleted}


@app.post("/api/cleanup/purge-expired")
async def manual_retention_purge(request: Request):
    admin = os.environ.get("RECONSTRUCTA_ADMIN_SESSION", "").strip()
    principal = await principal_from_request(request)
    if not admin or principal != admin:
        raise HTTPException(status_code=403, detail="Administrative access required")
    return {"status":"success","purged":await retention_worker.purge_all_expired()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
