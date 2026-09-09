"""
RECONSTRUCTA — PRODUCTION FASTAPI BACKEND SERVICE
Integrates OpenCV inpainting with actual measured quality evaluation, Cloudflare R2 temporary storage,
MongoDB Atlas metadata tracking, and strict 2-hour retention with automated background cleanup.
"""

import base64
import io
import os
import time
from contextlib import asynccontextmanager
from typing import Dict, List, Literal, Optional
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
import cv2
from PIL import Image

from database import db_manager, ProjectMetadataModel, ProjectVersionModel, AssetMetadataModel
from storage import storage_manager, StoredObjectMetadata, MAX_FILE_SIZE_BYTES
from retention import retention_worker, RETENTION_WINDOW_SECONDS


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize MongoDB and background retention worker
    await db_manager.initialize()
    retention_worker.start()
    yield
    # Shutdown: Stop worker and close DB connections
    await retention_worker.stop()
    await db_manager.close()


app = FastAPI(
    title="RECONSTRUCTA Production Backend Service",
    description="Secure Computer Vision, Inpainting with Real Quality Metrics, Cloudflare R2 Temporary Storage, and MongoDB Atlas Metadata.",
    version="2.0.0",
    lifespan=lifespan
)

# CORS Configuration
cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
allowed_origins = [orig.strip() for orig in cors_origins_env.split(",")] if cors_origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BoundingBoxModel(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class InpaintRequest(BaseModel):
    image_data: str  # Base64 data URL
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


def calculate_inpaint_quality(
    original_bgr: np.ndarray,
    restored_bgr: np.ndarray,
    mask: np.ndarray,
    bounds: BoundingBoxModel
) -> tuple[float, str, List[str]]:
    """
    Computes actual quality metrics on the inpainting result:
    1. Edge continuity across the perimeter boundary using Laplacian gradients.
    2. Color continuity / delta-E between the boundary zone and context.
    3. Variance preservation in the restored region.
    Returns: (quality_score: float, quality_label: str, warnings: List[str])
    """
    warnings: List[str] = []
    h, w, _ = original_bgr.shape

    # Construct boundary perimeter ring (dilate mask by 3px and subtract original mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    dilated_mask = cv2.dilate(mask, kernel, iterations=1)
    boundary_ring = cv2.bitwise_xor(dilated_mask, mask)

    # 1. Edge Gradient Continuity Analysis
    orig_gray = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2GRAY)
    rest_gray = cv2.cvtColor(restored_bgr, cv2.COLOR_BGR2GRAY)

    lap_orig = cv2.Laplacian(orig_gray, cv2.CV_32F)
    lap_rest = cv2.Laplacian(rest_gray, cv2.CV_32F)

    boundary_pixels = boundary_ring > 0
    if np.sum(boundary_pixels) > 0:
        grad_diff = np.abs(lap_orig[boundary_pixels] - lap_rest[boundary_pixels])
        mean_grad_error = float(np.mean(grad_diff))
    else:
        mean_grad_error = 0.0

    # 2. Color Continuity along the perimeter
    if np.sum(boundary_pixels) > 0:
        color_diff = np.abs(original_bgr[boundary_pixels].astype(np.float32) - restored_bgr[boundary_pixels].astype(np.float32))
        mean_color_diff = float(np.mean(color_diff))
    else:
        mean_color_diff = 0.0

    # 3. Variance / Texture Preservation
    bx, by, bw, bh = bounds.x, bounds.y, bounds.width, bounds.height
    safe_w = min(bw, w - bx)
    safe_h = min(bh, h - by)
    patch_restored = rest_gray[by:by + safe_h, bx:bx + safe_w]

    restored_var = float(np.var(patch_restored)) if patch_restored.size > 0 else 100.0

    # 4. Mask relative area
    mask_area_ratio = (bw * bh) / (w * h)

    # Compute quality penalties
    # Edge continuity penalty
    edge_penalty = min(0.35, mean_grad_error / 80.0)
    # Color mismatch penalty
    color_penalty = min(0.35, mean_color_diff / 50.0)
    # Area penalty for very large patches
    area_penalty = min(0.20, mask_area_ratio * 0.8)

    base_score = 1.0 - (edge_penalty + color_penalty + area_penalty)
    quality_score = float(np.clip(round(base_score, 2), 0.10, 0.99))

    # Determine Label
    if quality_score >= 0.90:
        quality_label = "excellent"
    elif quality_score >= 0.75:
        quality_label = "good"
    elif quality_score >= 0.60:
        quality_label = "acceptable"
    elif quality_score >= 0.40:
        quality_label = "poor"
    else:
        quality_label = "failed"

    # Assemble Warnings
    if mean_grad_error > 25.0:
        warnings.append("Perimeter gradient discontinuity detected; subtle boundary edge may be visible.")
    if mean_color_diff > 18.0:
        warnings.append("Perimeter color transition deviates from background context.")
    if mask_area_ratio > 0.15:
        warnings.append("Large inpainting area; structural diffusion smoothing is perceptible.")
    if restored_var < 5.0 and mean_grad_error > 15.0:
        warnings.append("Flat region synthesized inside high-frequency context.")

    return quality_score, quality_label, warnings


@app.get("/api/health")
async def health_check():
    """Health check endpoint providing active backend capabilities and operational status."""
    return {
        "status": "ok",
        "service": "RECONSTRUCTA Production Engine",
        "mode": "production_hardened",
        "opencv_version": cv2.__version__,
        "mongodb_connected": db_manager.is_connected,
        "mongodb_fallback": db_manager.is_fallback,
        "r2_active": storage_manager.is_r2_active,
        "retention_hours": 2,
        "retention_seconds": RETENTION_WINDOW_SECONDS,
        "timestamp": time.time()
    }


@app.post("/api/inpaint", response_model=InpaintResponse)
async def inpaint_region(req: InpaintRequest):
    """
    Performs OpenCV inpainting on the specified bounding box using Telea or Navier-Stokes.
    Measures edge continuity, color continuity, and variance to compute a genuine quality metric.
    """
    start_time = time.time()

    # 1. Decode base64 image data
    try:
        header, encoded = req.image_data.split(",", 1) if "," in req.image_data else ("", req.image_data)
        raw_bytes = base64.b64decode(encoded)

        if len(raw_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="Payload exceeds 50MB security limit.")

        image_pil = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        img_np = np.array(image_pil)
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image payload provided.")

    h, w, _ = img_bgr.shape
    bx = req.bounds.x
    by = req.bounds.y
    bw = req.bounds.width
    bh = req.bounds.height

    if bx >= w or by >= h:
        raise HTTPException(status_code=400, detail="Bounding box coordinates are out of image bounds.")

    safe_w = min(bw, w - bx)
    safe_h = min(bh, h - by)

    # 2. Construct binary inpainting mask
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[by:by + safe_h, bx:bx + safe_w] = 255

    # 3. Execute OpenCV Inpainting
    flag = cv2.INPAINT_TELEA if req.algorithm == "telea" else cv2.INPAINT_NS
    try:
        restored_bgr = cv2.inpaint(img_bgr, mask, req.inpaint_radius, flag)
    except Exception:
        raise HTTPException(status_code=500, detail="OpenCV inpainting restoration failed.")

    # 4. Measure Quality Metrics
    quality_score, quality_label, warnings = calculate_inpaint_quality(
        original_bgr=img_bgr,
        restored_bgr=restored_bgr,
        mask=mask,
        bounds=req.bounds
    )

    # 5. Encode restored image to PNG Data URL
    restored_rgb = cv2.cvtColor(restored_bgr, cv2.COLOR_BGR2RGB)
    out_pil = Image.fromarray(restored_rgb)
    out_buffer = io.BytesIO()
    out_pil.save(out_buffer, format="PNG")
    out_bytes = out_buffer.getvalue()
    out_base64 = base64.b64encode(out_bytes).decode("utf-8")
    out_data_url = f"data:image/png;base64,{out_base64}"

    processing_time = round((time.time() - start_time) * 1000, 2)

    return InpaintResponse(
        status="success",
        algorithm_used=f"opencv_{req.algorithm}",
        restored_image_data=out_data_url,
        quality_score=quality_score,
        quality_label=quality_label,
        warnings=warnings,
        processing_time_ms=processing_time
    )


@app.post("/api/files/upload")
async def upload_temporary_file(
    file: UploadFile = File(...),
    project_id: str = Form("default"),
    purpose: str = Form("uploads")
):
    """
    Accepts multipart file uploads, validates payload size and formats,
    stores in Cloudflare R2 under a cryptographic random key with 2-hour expiration,
    and registers metadata in MongoDB Atlas.
    """
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 50MB security limit.")

    content_type = file.content_type or "application/octet-stream"

    # Store in R2 Temporary Bucket
    meta: StoredObjectMetadata = storage_manager.upload_file(
        data=file_bytes,
        project_id=project_id,
        purpose=purpose,
        content_type=content_type,
        ttl_seconds=RETENTION_WINDOW_SECONDS
    )

    # Register in MongoDB Atlas Metadata Layer
    assets_col = db_manager.get_collection("assets")
    asset_doc = AssetMetadataModel(
        object_id=meta.object_id,
        project_id=project_id,
        purpose=meta.purpose,
        content_type=meta.content_type,
        size_bytes=meta.size,
        sha256=meta.sha256,
        created_at=meta.created_at,
        expires_at=meta.expires_at
    ).model_dump()

    await assets_col.insert_one(asset_doc)

    return {
        "status": "success",
        "object_id": meta.object_id,
        "project_id": meta.project_id,
        "purpose": meta.purpose,
        "content_type": meta.content_type,
        "size_bytes": meta.size,
        "sha256": meta.sha256,
        "expires_at": meta.expires_at
    }


@app.get("/api/files/{object_id}")
async def download_temporary_file(object_id: str):
    """Streams a temporary file from R2 if not yet expired (strict 2-hour retention)."""
    result = storage_manager.download_file(object_id)
    if not result:
        raise HTTPException(status_code=404, detail="File not found or expired under 2-hour retention.")

    file_bytes, meta = result
    remaining_seconds = max(0, int(meta.expires_at - time.time()))

    return Response(
        content=file_bytes,
        media_type=meta.content_type,
        headers={
            "Cache-Control": f"private, no-transform, max-age={remaining_seconds}",
            "X-Expires-At": str(meta.expires_at),
            "X-SHA256": meta.sha256
        }
    )


@app.delete("/api/files/{object_id}")
async def delete_temporary_file(object_id: str):
    """Explicitly deletes a temporary file from R2 and removes its MongoDB metadata."""
    deleted_storage = storage_manager.delete_file(object_id)
    assets_col = db_manager.get_collection("assets")
    await assets_col.delete_one({"object_id": object_id})

    return {
        "status": "success",
        "object_id": object_id,
        "deleted": deleted_storage
    }


@app.post("/api/projects")
async def save_project_metadata(req: ProjectCreateRequest):
    """Saves or updates project metadata in MongoDB Atlas with a fresh 2-hour TTL."""
    projects_col = db_manager.get_collection("projects")
    now = time.time()
    expires_at = now + RETENTION_WINDOW_SECONDS

    doc = ProjectMetadataModel(
        project_id=req.project_id,
        owner_session=req.owner_session,
        name=req.name,
        platform=req.platform,
        schema_version=req.schema_version,
        canvas_width=req.canvas_width,
        canvas_height=req.canvas_height,
        node_count=req.node_count,
        created_at=now,
        updated_at=now,
        expires_at=expires_at
    ).model_dump()

    await projects_col.update_one(
        {"project_id": req.project_id},
        {"$set": doc},
        upsert=True
    )

    return {"status": "success", "project_id": req.project_id, "expires_at": expires_at}


@app.get("/api/projects/{project_id}")
async def get_project_metadata(project_id: str):
    """Retrieves project metadata from MongoDB Atlas."""
    projects_col = db_manager.get_collection("projects")
    project = await projects_col.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or expired.")
    return project


@app.post("/api/projects/{project_id}/touch")
async def touch_project(project_id: str):
    """Extends the project and its assets by 2 hours upon successful modification or export."""
    new_expiry = await retention_worker.extend_project_retention(project_id)
    return {"status": "success", "project_id": project_id, "expires_at": new_expiry}


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Deletes project metadata and cleans up all associated R2 assets."""
    assets_col = db_manager.get_collection("assets")
    assets = await assets_col.find({"project_id": project_id})
    asset_list = await assets.to_list(1000)

    for a in asset_list:
        obj_id = a.get("object_id")
        if obj_id:
            storage_manager.delete_file(obj_id)

    await assets_col.delete_many({"project_id": project_id})
    projects_col = db_manager.get_collection("projects")
    await projects_col.delete_one({"project_id": project_id})

    return {"status": "success", "project_id": project_id}


@app.post("/api/cleanup/purge-expired")
async def manual_retention_purge():
    """Explicitly triggers the 2-hour retention cleanup sweep."""
    summary = await retention_worker.purge_all_expired()
    return {"status": "success", "purged": summary}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
