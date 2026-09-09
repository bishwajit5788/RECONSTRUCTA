"""
RECONSTRUCTA — FASTAPI AUXILIARY BACKEND SERVICE
Provides accelerated OpenCV inpainting (TELEA / NS) and secure computer-vision routines.
"""

import base64
import io
import time
from typing import Literal, Optional
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
import cv2
from PIL import Image

app = FastAPI(
    title="RECONSTRUCTA Backend Service",
    description="Computer Vision, OpenCV Inpainting, and Document Analysis for RECONSTRUCTA",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_PAYLOAD_BYTES = 50 * 1024 * 1024  # 50MB safety limit

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
    processing_time_ms: float

@app.get("/api/health")
async def health_check():
    """Health check endpoint for frontend connection status detection."""
    return {
        "status": "ok",
        "service": "RECONSTRUCTA Computer Vision Engine",
        "mode": "backend_hybrid",
        "opencv_version": cv2.__version__,
        "timestamp": time.time()
    }

@app.post("/api/inpaint", response_model=InpaintResponse)
async def inpaint_region(req: InpaintRequest):
    """
    Performs OpenCV inpainting on the specified bounding box using
    Alexandru Telea (INPAINT_TELEA) or Navier-Stokes (INPAINT_NS) algorithms.
    """
    start_time = time.time()

    # 1. Decode base64 image data
    try:
        header, encoded = req.image_data.split(",", 1) if "," in req.image_data else ("", req.image_data)
        raw_bytes = base64.b64decode(encoded)

        if len(raw_bytes) > MAX_PAYLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Payload exceeds 50MB security limit.")

        image_pil = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        img_np = np.array(image_pil)
        # Convert RGB to BGR for OpenCV
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid image data provided.")

    h, w, _ = img_bgr.shape
    bx = req.bounds.x
    by = req.bounds.y
    bw = req.bounds.width
    bh = req.bounds.height

    # Validate bounds inside image dimensions
    if bx >= w or by >= h:
        raise HTTPException(status_code=400, detail="Bounding box is out of image boundaries.")

    safe_w = min(bw, w - bx)
    safe_h = min(bh, h - by)

    # 2. Create Inpainting Mask (Single channel 8-bit binary mask)
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[by:by + safe_h, bx:bx + safe_w] = 255

    # 3. Execute OpenCV Inpainting
    flag = cv2.INPAINT_TELEA if req.algorithm == "telea" else cv2.INPAINT_NS
    try:
        restored_bgr = cv2.inpaint(img_bgr, mask, req.inpaint_radius, flag)
    except Exception as cv_err:
        raise HTTPException(status_code=500, detail="Computer vision restoration failed.")

    # 4. Encode back to PNG base64 Data URL
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
        processing_time_ms=processing_time
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
