/**
 * RECONSTRUCTA — INPAINTING CLIENT (HYBRID LOCAL + BACKEND)
 * Dispatches inpainting requests to the local canvas engine or FastAPI OpenCV service.
 */

import { BoundingBox, InpaintPatch } from '../../types/sceneGraph';
import { CanvasInpaint } from './canvasInpaint';

export class InpaintClient {
  private static backendUrl = 'http://localhost:8000';
  private static isBackendOnline = false;
  private static lastCheckTime = 0;

  /**
   * Checks if the optional FastAPI backend service is responding
   */
  static async checkBackendHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastCheckTime < 5000) {
      return this.isBackendOnline;
    }
    this.lastCheckTime = now;

    try {
      const res = await fetch(`${this.backendUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1200)
      });
      this.isBackendOnline = res.ok;
    } catch {
      this.isBackendOnline = false;
    }
    return this.isBackendOnline;
  }

  /**
   * Restores an image region using local canvas or backend OpenCV inpainting
   */
  static async restoreRegion(
    canvas: HTMLCanvasElement,
    bounds: BoundingBox,
    useBackendIfAvailable: boolean = true,
    algorithm: 'telea' | 'ns' = 'telea'
  ): Promise<InpaintPatch> {
    // 1. If backend requested and available, attempt OpenCV inpainting
    if (useBackendIfAvailable) {
      const isOnline = await this.checkBackendHealth();
      if (isOnline) {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const res = await fetch(`${this.backendUrl}/api/inpaint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_data: dataUrl,
              bounds: {
                x: Math.round(bounds.x),
                y: Math.round(bounds.y),
                width: Math.round(bounds.width),
                height: Math.round(bounds.height)
              },
              algorithm
            }),
            signal: AbortSignal.timeout(4000)
          });

          if (res.ok) {
            const data = await res.json();
            // Render restored image back to canvas
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
              img.onload = () => {
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0);
                resolve();
              };
              img.onerror = reject;
              img.src = data.restored_image_data;
            });

            return {
              originalDataUrl: dataUrl,
              restoredDataUrl: data.restored_image_data,
              qualityScore: data.quality_score ?? 0.85,
              qualityLabel: data.quality_label ?? 'good',
              algorithmUsed: algorithm === 'ns' ? 'opencv_ns' : 'opencv_telea',
              warnings: data.warnings || []
            };
          }
        } catch (backendErr) {
          console.warn('Backend inpainting request failed, falling back to local canvas:', backendErr);
        }
      }
    }

    // 2. Local-first fallback: Client Canvas Inpainting
    return CanvasInpaint.inpaintRegion(canvas, bounds);
  }
}
