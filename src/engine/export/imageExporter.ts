import { SceneGraph } from '../../types/sceneGraph';
import { ExportConfig } from '../../types/project';

export class ImageExporter {
  /**
   * Renders the complete scene graph to an exportable Blob.
   * The export is independent of the visible viewport: it reconstructs the
   * document from the scene graph, including the original/background image
   * and all editable image/text/shape nodes.
   */
  static async exportToBlob(
    sceneGraph: SceneGraph,
    baseCanvas: HTMLCanvasElement | null,
    config: ExportConfig
  ): Promise<Blob> {
    const scale = config.scale || 1;
    const width = Math.max(1, Math.round(sceneGraph.canvasWidth * scale));
    const height = Math.max(1, Math.round(sceneGraph.canvasHeight * scale));

    const outCanvas = document.createElement('canvas');
    outCanvas.width = width;
    outCanvas.height = height;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to obtain export canvas 2D context.');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Draw the actual document background. Prefer the original imported
    // image stored in the scene graph so export still works after reload.
    const backgroundSrc = sceneGraph.originalImageUrl || sceneGraph.backgroundImageUrl;
    if (backgroundSrc) {
      await this.drawImageSource(ctx, backgroundSrc, 0, 0, width, height);
    } else if (baseCanvas) {
      ctx.drawImage(baseCanvas, 0, 0, width, height);
    } else {
      ctx.fillStyle = sceneGraph.backgroundColor || '#08070A';
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Render editable layers above the flattened source. Background nodes
    // are already represented by originalImageUrl/backgroundImageUrl.
    const sortedNodes = Object.values(sceneGraph.nodes)
      .filter((n) => n.visible && n.type !== 'background')
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const node of sortedNodes) {
      ctx.save();
      const nx = node.x * scale;
      const ny = node.y * scale;
      const nw = node.width * scale;
      const nh = node.height * scale;
      ctx.globalAlpha = node.opacity ?? 1;

      if (node.rotation) {
        ctx.translate(nx + nw / 2, ny + nh / 2);
        ctx.rotate((node.rotation * Math.PI) / 180);
        ctx.translate(-(nx + nw / 2), -(ny + nh / 2));
      }

      // Image/media layer support.
      if (node.src) {
        try {
          await this.drawImageSource(ctx, node.src, nx, ny, nw, nh);
        } catch {
          // Keep export deterministic; a missing optional layer must not erase
          // the rest of the document.
        }
      }

      // Container background/stroke.
      if (node.backgroundColor || node.strokeColor) {
        const r = (node.borderRadius || 8) * scale;
        this.drawRoundedRect(ctx, nx, ny, nw, nh, r);
        if (node.backgroundColor) {
          ctx.fillStyle = node.backgroundColor;
          ctx.fill();
        }
        if (node.strokeColor) {
          ctx.strokeStyle = node.strokeColor;
          ctx.lineWidth = (node.strokeWidth || 1) * scale;
          ctx.stroke();
        }
      }

      // Text layer.
      if (node.content) {
        const fontSize = (node.fontSize || 14) * scale;
        const fontFamily = node.fontFamily || 'Inter, sans-serif';
        const fontWeight = node.fontWeight || 400;
        ctx.font = `${node.fontStyle || 'normal'} ${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = node.color || '#FFFFFF';
        ctx.textBaseline = 'top';

        const maxLineWidth = Math.max(nw - 8 * scale, 20 * scale);
        const lines: string[] = [];
        for (const para of node.content.split(/\r?\n/)) {
          if (!para) {
            lines.push('');
            continue;
          }
          let current = '';
          for (const word of para.split(' ')) {
            const candidate = current ? `${current} ${word}` : word;
            if (current && ctx.measureText(candidate).width > maxLineWidth) {
              lines.push(current);
              current = word;
            } else {
              current = candidate;
            }
          }
          if (current) lines.push(current);
        }

        const lineHeight = fontSize * (node.lineHeight || 1.25);
        lines.forEach((line, index) => {
          if (node.alignment === 'center') {
            ctx.textAlign = 'center';
            ctx.fillText(line, nx + nw / 2, ny + 2 * scale + index * lineHeight);
          } else if (node.alignment === 'right') {
            ctx.textAlign = 'right';
            ctx.fillText(line, nx + nw - 4 * scale, ny + 2 * scale + index * lineHeight);
          } else {
            ctx.textAlign = 'left';
            ctx.fillText(line, nx + 4 * scale, ny + 2 * scale + index * lineHeight);
          }
        });
      }

      ctx.restore();
    }

    if (config.includeWatermark) {
      this.renderProvenanceWatermark(ctx, width, height, scale, config.watermarkText);
    }

    const mimeType = config.format === 'jpeg'
      ? 'image/jpeg'
      : config.format === 'webp'
        ? 'image/webp'
        : 'image/png';

    return new Promise<Blob>((resolve, reject) => {
      outCanvas.toBlob(
        (blob) => blob && blob.size > 0
          ? resolve(blob)
          : reject(new Error('Canvas export generated an empty or invalid blob.')),
        mimeType,
        config.quality || 0.95
      );
    });
  }

  private static async drawImageSource(
    ctx: CanvasRenderingContext2D,
    src: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to load export image layer.'));
      img.src = src;
    });
    ctx.drawImage(image, x, y, width, height);
  }

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
    ctx.fillStyle = 'rgba(8, 7, 10, 0.78)';
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    ctx.lineWidth = 1 * scale;
    this.drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 4 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#D4AF37';
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
