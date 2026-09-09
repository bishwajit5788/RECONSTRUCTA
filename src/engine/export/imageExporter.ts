/**
 * RECONSTRUCTA — IMAGE EXPORT & PROVENANCE WATERMARK ENGINE
 * Renders composite scene graphs to high-resolution PNG, WebP, and JPEG files
 * with calibrated "EDITED / MOCKUP" provenance indicators.
 */

import { SceneGraph, SceneNode } from '../../types/sceneGraph';
import { ExportConfig } from '../../types/project';

export class ImageExporter {
  /**
   * Renders the complete scene graph to an exportable Blob
   */
  static async exportToBlob(
    sceneGraph: SceneGraph,
    baseCanvas: HTMLCanvasElement | null,
    config: ExportConfig
  ): Promise<Blob> {
    const scale = config.scale || 1;
    const width = sceneGraph.canvasWidth * scale;
    const height = sceneGraph.canvasHeight * scale;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = width;
    outCanvas.height = height;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to obtain export canvas 2D context.');
    }

    // High quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Draw Background
    if (baseCanvas) {
      ctx.drawImage(baseCanvas, 0, 0, width, height);
    } else {
      ctx.fillStyle = sceneGraph.backgroundColor || '#08070A';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Sort Nodes by zIndex
    const sortedNodes = Object.values(sceneGraph.nodes)
      .filter((n) => n.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    // 3. Render Each Node
    for (const node of sortedNodes) {
      ctx.save();
      const nx = node.x * scale;
      const ny = node.y * scale;
      const nw = node.width * scale;
      const nh = node.height * scale;

      ctx.globalAlpha = node.opacity ?? 1;

      // Rotation
      if (node.rotation) {
        ctx.translate(nx + nw / 2, ny + nh / 2);
        ctx.rotate((node.rotation * Math.PI) / 180);
        ctx.translate(-(nx + nw / 2), -(ny + nh / 2));
      }

      // Render Node Content
      if (node.type === 'message' || node.type === 'button' || node.type === 'shape') {
        // Container background
        if (node.backgroundColor) {
          ctx.fillStyle = node.backgroundColor;
          const r = (node.borderRadius || 8) * scale;
          this.drawRoundedRect(ctx, nx, ny, nw, nh, r);
          ctx.fill();
        }
        if (node.strokeColor) {
          ctx.strokeStyle = node.strokeColor;
          ctx.lineWidth = (node.strokeWidth || 1) * scale;
          ctx.stroke();
        }
      }

      // Render Text
      if (node.content) {
        const fontSize = (node.fontSize || 14) * scale;
        const fontFamily = node.fontFamily || 'Inter, sans-serif';
        const fontWeight = node.fontWeight || 400;
        ctx.font = `${node.fontStyle || 'normal'} ${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = node.color || '#FFFFFF';
        ctx.textBaseline = 'top';

        if (node.alignment === 'center') {
          ctx.textAlign = 'center';
          ctx.fillText(node.content, nx + nw / 2, ny + 2 * scale);
        } else if (node.alignment === 'right') {
          ctx.textAlign = 'right';
          ctx.fillText(node.content, nx + nw - 4 * scale, ny + 2 * scale);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(node.content, nx + 4 * scale, ny + 2 * scale);
        }
      }

      ctx.restore();
    }

    // 4. Provenance Watermark Overlay (Section 2 & 28 safety requirement)
    if (config.includeWatermark) {
      this.renderProvenanceWatermark(ctx, width, height, scale, config.watermarkText);
    }

    // 5. Convert to Blob with format & quality
    const mimeType =
      config.format === 'jpeg' ? 'image/jpeg' : config.format === 'webp' ? 'image/webp' : 'image/png';

    return new Promise<Blob>((resolve, reject) => {
      outCanvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
          } else {
            reject(new Error('Canvas export generated an empty or invalid blob.'));
          }
        },
        mimeType,
        config.quality || 0.95
      );
    });
  }

  /**
   * Discrete luxury provenance badge
   */
  private static renderProvenanceWatermark(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    customText?: string
  ): void {
    ctx.save();
    const text = customText || 'EDITED / MOCKUP';
    const fontSize = Math.max(Math.round(11 * scale), 10);
    ctx.font = `600 ${fontSize}px "Inter", sans-serif`;

    const textWidth = ctx.measureText(text).width;
    const badgeW = textWidth + 18 * scale;
    const badgeH = 22 * scale;
    const badgeX = width - badgeW - 14 * scale;
    const badgeY = height - badgeH - 14 * scale;

    // Subtle dark pill background
    ctx.fillStyle = 'rgba(8, 7, 10, 0.78)';
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    ctx.lineWidth = 1 * scale;
    this.drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 4 * scale);
    ctx.fill();
    ctx.stroke();

    // Text label
    ctx.fillStyle = '#D4AF37'; // Antique Gold
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2);

    ctx.restore();
  }

  private static drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }
}
