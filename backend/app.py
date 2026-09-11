"""
RECONSTRUCTA — PRODUCTION FASTAPI BACKEND SERVICE
Integrates OpenCV inpainting, Cloudflare R2 temporary storage, MongoDB metadata,
strict retention, and optional fail-closed bearer authentication.
"""

import base64
import io
import logging
import os
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Dict, List, Literal, Optional
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
import cv2
from PIL import Image

from auth import verify_session_token
from database import db_manager, ProjectMetadataModel, ProjectVersionModel, AssetMetadataModel
from storage import storage_manager, StoredObjectMetadata, MAX_FILE_SIZE_BYTES, validate_magic_bytes, check_zip_bomb, LOCAL_DEV_STORAGE
from retention import retention_worker, RETENTION_WINDOW_SECONDS

logger = logging.getLogger("reconstructa.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

AUTH_REQUIRED = os.environ.get("RECONSTRUCTA_AUTH_REQUIRED", "false").lower() in {"true", "1", "yes"}
MAX_REQUEST_BODY_BYTES = 60 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db_manager.initialize()
    retention_worker.start()
    yield
    await retention_worker.stop()
    await db_manager.close()


app = FastAPI(
    title="RECONSTRUCTA Production Backend Service",
    description="Secure reconstruction, inpainting, temporary storage, and metadata service.",
    version="2.1.0",
    lifespan=lifespan,
)

# Never combine wildcard origins with credentials. Production must explicitly list origins.
cors_origins_env = os.environ.get("CORS_ORIGINS", "")
allowed_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
if not allowed_origins and not LOCAL_DEV_STORAGE:
    raise RuntimeError("CORS_ORIGINS must be explicitly configured in production")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

_rate_limits: Dict[str, List[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60.0
RATE_LIMIT_MAX_REQUESTS = 180


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    start_time = time.time()

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BODY_BYTES:
        return Response(content='{"detail":"Request body exceeds the 60MB security limit."}', status_code=413, media_type="application/json", headers={"X-Request-ID": req_id})

    client_ip = request.client.host if request.client else "127.0.0.1"
    now = time.time()
    timestamps = [t for t in _rate_limits[client_ip] if now - t < RATE_LIMIT_WINDOW]
    if len(timestamps) >= RATE_LIMIT_MAX_REQUESTS:
        return Response(content='{"detail":"Rate limit exceeded. Try again later."}', status_code=429, media_type="application/json", headers={"X-Request-ID": req_id})
    timestamps.append(now)
    _rate_limits[client_ip] = timestamps

    # Authentication is opt-in for local development and mandatory when enabled.
    if AUTH_REQUIRED and request.url.path not in {"/api/health", "/api/ready", "/docs", "/openapi.json"}:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return Response(content='{"detail":"Authentication required."}', status_code=401, media_type="application/json", headers={"X-Request-ID": req_id, "WWW-Authenticate": "Bearer"})
        try:
            subject = verify_session_token(auth[7:].strip())
        except RuntimeError:
            subject = None
        if not subject:
            return Response(content='{"detail":"Invalid or expired authentication token."}', status_code=401, media_type="application/json", headers={"X-Request-ID": req_id, "WWW-Authenticate": "Bearer"})
        request.state.subject = subject

    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    duration_ms = round((time.time() - start_time) * 1000, 2)
    logger.info(f"REQ {req_id} | {request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)")
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
    project_id: str
    owner_session: str
    name: str = "Untitled Reconstruction"
    platform: str = "generic"
    schema_version: int = 1
    canvas_width: int = 1080
    canvas_height: int = 1920
    node_count: int = 0


def calculate_inpaint_quality(original_bgr: np.ndarray, restored_bgr: np.ndarray, mask: np.ndarray, bounds: BoundingBoxModel) -> tuple[float, str, List[str]]:
    warnings: List[str] = []
    h, w, _ = original_bgr.shape
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    boundary_ring = cv2.bitwise_xor(cv2.dilate(mask, kernel, iterations=1), mask)
    orig_gray = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2GRAY)
    rest_gray = cv2.cvtColor(restored_bgr, cv2.COLOR_BGR2GRAY)
    lap_orig = cv2.Laplacian(orig_gray, cv2.CV_32F)
    lap_rest = cv2.Laplacian(rest_gray, cv2.CV_32F)
    boundary_pixels = boundary_ring > 0
    mean_grad_error = float(np.mean(np.abs(lap_orig[boundary_pixels] - lap_rest[boundary_pixels]))) if np.sum(boundary_pixels) else 0.0
    mean_color_diff = float(np.mean(np.abs(original_bgr[boundary_pixels].astype(np.float32) - restored_bgr[boundary_pixels].astype(np.float32)))) if np.sum(boundary_pixels) else 0.0
    bx, by, bw, bh = bounds.x, bounds.y, bounds.width, bounds.height
    patch = rest_gray[by:min(by + bh, h), bx:min(bx + bw, w)]
    restored_var = float(np.var(patch)) if patch.size else 100.0
    mask_area_ratio = (bw * bh) / (w * h)
    score = float(np.clip(round(1.0 - min(0.35, mean_grad_error / 80.0) - min(0.35, mean_color_diff / 50.0) - min(0.20, mask_area_ratio * 0.8), 2), 0.10, 0.99))
    label = "excellent" if score >= 0.90 else "good" if score >= 0.75 else "acceptable" if score >= 0.60 else "poor" if score >= 0.40 else "failed"
    if mean_grad_error > 25: warnings.append("Perimeter gradient discontinuity detected; subtle boundary edge may be visible.")
    if mean_color_diff > 18: warnings.append("Perimeter color transition deviates from background context.")
    if mask_area_ratio > 0.15: warnings.append("Large inpainting area; structural diffusion smoothing is perceptible.")
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


@app.post("/api/inpaint", response_model=InpaintResponse)
async def inpaint_region(req: InpaintRequest):
    start_time = time.time()
    try:
        _, encoded = req.image_data.split(",", 1) if "," in req.image_data else ("", req.image_data)
        raw_bytes = base64.b64decode(encoded, validate=True)
        if len(raw_bytes) > MAX_FILE_SIZE_BYTES: raise HTTPException(status_code=413, detail="Payload exceeds 50MB security limit.")
        image_pil = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        img_bgr = cv2.cvtColor(np.array(image_pil), cv2.COLOR_RGB2BGR)
    except HTTPException: raise
    except Exception: raise HTTPException(status_code=400, detail="Invalid image payload provided.")
    h, w, _ = img_bgr.shape
    if h * w > 16_777_216: raise HTTPException(status_code=400, detail="Image exceeds maximum allowable pixel dimensions (16MP).")
    bx, by, bw, bh = req.bounds.x, req.bounds.y, req.bounds.width, req.bounds.height
    if bx >= w or by >= h: raise HTTPException(status_code=400, detail="Bounding box coordinates are out of image bounds.")
    safe_w, safe_h = min(bw, w - bx), min(bh, h - by)
    mask = np.zeros((h, w), dtype=np.uint8); mask[by:by + safe_h, bx:bx + safe_w] = 255
    try:
        flag = cv2.INPAINT_TELEA if req.algorithm == "telea" else cv2.INPAINT_NS
        restored_bgr = cv2.inpaint(img_bgr, mask, req.inpaint_radius, flag)
    except Exception: raise HTTPException(status_code=500, detail="OpenCV inpainting restoration failed.")
    quality_score, quality_label, warnings = calculate_inpaint_quality(img_bgr, restored_bgr, mask, req.bounds)
    out = io.BytesIO(); Image.fromarray(cv2.cvtColor(restored_bgr, cv2.COLOR_BGR2RGB)).save(out, format="PNG")
    return InpaintResponse(status="success", algorithm_used=f"opencv_{req.algorithm}", restored_image_data=f"data:image/png;base64,{base64.b64encode(out.getvalue()).decode()}", quality_score=quality_score, quality_label=quality_label, warnings=warnings, processing_time_ms=round((time.time() - start_time) * 1000, 2))


@app.post("/api/files/upload")
async def upload_temporary_file(file: UploadFile = File(...), project_id: str = Form("default"), purpose: str = Form("uploads")):
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES: raise HTTPException(status_code=413, detail="File exceeds the 50MB security limit.")
    is_valid_magic, detected_mime = validate_magic_bytes(file_bytes)
    if not is_valid_magic: raise HTTPException(status_code=400, detail="Invalid file signature or unsupported binary type.")
    filename_lower = (file.filename or "").lower()
    if detected_mime == "application/zip" or filename_lower.endswith((".docx", ".pptx", ".zip")):
        safe_zip, reason = check_zip_bomb(file_bytes)
        if not safe_zip: raise HTTPException(status_code=400, detail=f"File rejected: {reason}")
    content_type = detected_mime if detected_mime != "application/octet-stream" else (file.content_type or "application/octet-stream")
    meta: StoredObjectMetadata = storage_manager.upload_file(file_bytes, project_id, purpose, content_type, RETENTION_WINDOW_SECONDS)
    assets_col = db_manager.get_collection("assets")
    asset_doc = AssetMetadataModel(object_id=meta.object_id, project_id=project_id, purpose=meta.purpose, content_type=meta.content_type, size_bytes=meta.size, sha256=meta.sha256, created_at=meta.created_at, expires_at=meta.expires_at).model_dump()
    await assets_col.insert_one(asset_doc)
    return {"status":"success","object_id":meta.object_id,"project_id":meta.project_id,"purpose":meta.purpose,"content_type":meta.content_type,"size_bytes":meta.size,"sha256":meta.sha256,"expires_at":meta.expires_at}
