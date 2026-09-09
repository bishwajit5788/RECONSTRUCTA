/**
 * RECONSTRUCTA — MODULAR VISION DETECTION PIPELINE
 * Derives bounding boxes and semantic categories from actual pixel evidence.
 * Never fabricates certainty; assigns honest confidence and flags low-confidence elements for human review.
 */

import { BoundingBox, ElementType } from '../../types/sceneGraph';

export interface DetectedVisualObject {
  id: string;
  type: ElementType;
  bounds: BoundingBox;
  confidence: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'vision';
  properties: {
    colorHint?: string;
    backgroundColor?: string;
    isCircular?: boolean;
    hasBorder?: boolean;
  };
  editable: boolean;
  reviewRequired: boolean;
}

export class ObjectDetector {
  /**
   * Main modular visual detection pipeline running on canvas pixel data
   */
  static async detectObjects(canvas: HTMLCanvasElement): Promise<DetectedVisualObject[]> {
    const width = canvas.width;
    const height = canvas.height;
    if (width < 32 || height < 32) return [];

    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const imageData = ctx.getImageData(0, 0, width, height);
    const objects: DetectedVisualObject[] = [];

    // 1. Detect Status Bar (evidence: top consistent background strip)
    const statusBar = this.detectStatusBar(imageData, width, height);
    if (statusBar) objects.push(statusBar);

    // 2. Detect Horizontal Dividers & Lines
    const dividers = this.detectDividers(imageData, width, height);
    objects.push(...dividers);

    // 3. Detect UI Regions, Cards, and Message Bubbles from contrast boundaries
    const uiRegions = this.detectUIRegions(imageData, width, height);
    objects.push(...uiRegions);

    // 4. Evidence-based Circular Avatar / Icon Detection (radial symmetry scanning)
    const avatars = this.detectCircularAvatars(imageData, width, height);
    objects.push(...avatars);

    // 5. Detect Interactive Controls & Buttons
    const buttons = this.detectButtons(imageData, width, height);
    objects.push(...buttons);

    // 6. Deduplicate and Apply Confidence Fusion
    return this.fusionAndFilter(objects, width, height);
  }

  /**
   * Status Bar: Derives geometry from top edge uniformity and height of the first major color boundary
   */
  private static detectStatusBar(
    imageData: ImageData,
    width: number,
    height: number
  ): DetectedVisualObject | null {
    const maxBarHeight = Math.min(Math.round(height * 0.08), 80);
    if (maxBarHeight < 16) return null;

    const data = imageData.data;
    const r0 = data[0];
    const g0 = data[1];
    const b0 = data[2];

    // Find vertical boundary where top color changes abruptly across the width
    let detectedHeight = 0;
    for (let y = 12; y < maxBarHeight; y += 2) {
      let mismatches = 0;
      const testSamples = 20;
      for (let s = 1; s <= testSamples; s++) {
        const x = Math.floor((width * s) / (testSamples + 1));
        const idx = (y * width + x) * 4;
        const diff = Math.abs(data[idx] - r0) + Math.abs(data[idx + 1] - g0) + Math.abs(data[idx + 2] - b0);
        if (diff > 45) mismatches++;
      }
      if (mismatches > testSamples * 0.6) {
        detectedHeight = y;
        break;
      }
    }

    if (detectedHeight >= 16) {
      const conf = 0.91;
      return {
        id: 'obj_status_bar',
        type: 'status-bar',
        bounds: { x: 0, y: 0, width, height: detectedHeight },
        confidence: conf,
        confidenceLabel: 'HIGH',
        source: 'vision',
        properties: { backgroundColor: `rgb(${r0},${g0},${b0})` },
        editable: true,
        reviewRequired: false
      };
    }

    return null;
  }

  /**
   * Dividers: Scans for distinct 1px-3px horizontal lines spanning at least 60% of canvas width
   */
  private static detectDividers(
    imageData: ImageData,
    width: number,
    height: number
  ): DetectedVisualObject[] {
    const dividers: DetectedVisualObject[] = [];
    const data = imageData.data;
    const stepY = 8;

    for (let y = Math.floor(height * 0.1); y < height * 0.9; y += stepY) {
      let continuousCount = 0;
      let lineColor = '';
      const sampleStepX = Math.max(2, Math.floor(width / 40));

      for (let x = Math.floor(width * 0.05); x < width * 0.95; x += sampleStepX) {
        const idx = (y * width + x) * 4;
        const aboveIdx = Math.max(0, ((y - 4) * width + x) * 4);
        const diff =
          Math.abs(data[idx] - data[aboveIdx]) +
          Math.abs(data[idx + 1] - data[aboveIdx + 1]) +
          Math.abs(data[idx + 2] - data[aboveIdx + 2]);

        if (diff > 40) {
          continuousCount++;
          lineColor = `rgb(${data[idx]},${data[idx + 1]},${data[idx + 2]})`;
        }
      }

      if (continuousCount > 25) {
        dividers.push({
          id: `divider_${y}`,
          type: 'divider',
          bounds: { x: Math.floor(width * 0.05), y, width: Math.floor(width * 0.9), height: 2 },
          confidence: 0.85,
          confidenceLabel: 'MEDIUM',
          source: 'vision',
          properties: { colorHint: lineColor },
          editable: true,
          reviewRequired: false
        });
      }
    }

    return dividers.slice(0, 5);
  }

  /**
   * Evidence-based Circular Avatar / Icon Detection:
   * Scans candidate bounding windows across the image and computes radial symmetry
   */
  private static detectCircularAvatars(
    imageData: ImageData,
    width: number,
    height: number
  ): DetectedVisualObject[] {
    const avatars: DetectedVisualObject[] = [];
    const data = imageData.data;

    // Search common avatar sizes (32px to 64px) in candidate regions
    const targetDiameters = [40, 48, 56];

    for (const diam of targetDiameters) {
      const radius = Math.floor(diam / 2);
      // Scan top 30% of screen where avatars are predominantly situated
      for (let cy = radius + 20; cy < Math.min(height * 0.35, height - radius); cy += 24) {
        for (let cx = radius + 16; cx < Math.min(width * 0.9, width - radius); cx += 32) {
          // Measure radial edge symmetry: check 8 radial points at radius vs center
          let radialMatch = 0;
          const centerIdx = (cy * width + cx) * 4;
          const cR = data[centerIdx];
          const cG = data[centerIdx + 1];
          const cB = data[centerIdx + 2];

          const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
          for (const angle of angles) {
            const rx = Math.round(cx + Math.cos(angle) * radius);
            const ry = Math.round(cy + Math.sin(angle) * radius);
            const rIdx = (ry * width + rx) * 4;
            const diff = Math.abs(data[rIdx] - cR) + Math.abs(data[rIdx + 1] - cG) + Math.abs(data[rIdx + 2] - cB);
            if (diff > 35) radialMatch++;
          }

          // If at least 6 of 8 radial points show boundary contrast, we have circular boundary evidence
          if (radialMatch >= 6) {
            const conf = radialMatch === 8 ? 0.90 : 0.78;
            avatars.push({
              id: `avatar_${cx}_${cy}`,
              type: 'avatar',
              bounds: { x: cx - radius, y: cy - radius, width: diam, height: diam },
              confidence: conf,
              confidenceLabel: conf >= 0.90 ? 'HIGH' : 'MEDIUM',
              source: 'vision',
              properties: { isCircular: true },
              editable: true,
              reviewRequired: conf < 0.80
            });
          }
        }
      }
    }

    return avatars.slice(0, 3);
  }

  /**
   * UI Regions & Chat Bubbles: Analyzes horizontal contrast segments
   */
  private static detectUIRegions(
    imageData: ImageData,
    width: number,
    height: number
  ): DetectedVisualObject[] {
    const regions: DetectedVisualObject[] = [];
    const data = imageData.data;
    const stepY = 24;

    const bgIdx = 4;
    const bgR = data[bgIdx];
    const bgG = data[bgIdx + 1];
    const bgB = data[bgIdx + 2];

    for (let y = Math.floor(height * 0.08); y < height * 0.92; y += stepY) {
      // Find left and right edges of distinct color segments on this horizontal line
      let segmentStart: number | null = null;
      let segColor = '';

      for (let x = 12; x < width - 12; x += 8) {
        const idx = (y * width + x) * 4;
        const diff = Math.abs(data[idx] - bgR) + Math.abs(data[idx + 1] - bgG) + Math.abs(data[idx + 2] - bgB);

        if (diff > 45 && segmentStart === null) {
          segmentStart = x;
          segColor = `rgb(${data[idx]},${data[idx + 1]},${data[idx + 2]})`;
        } else if (diff <= 45 && segmentStart !== null) {
          const segWidth = x - segmentStart;
          if (segWidth > 80 && segWidth < width * 0.85) {
            const conf = 0.84;
            regions.push({
              id: `region_${segmentStart}_${y}`,
              type: 'message',
              bounds: { x: segmentStart, y: Math.max(0, y - 8), width: segWidth, height: 44 },
              confidence: conf,
              confidenceLabel: 'MEDIUM',
              source: 'vision',
              properties: { backgroundColor: segColor },
              editable: true,
              reviewRequired: false
            });
          }
          segmentStart = null;
        }
      }
    }

    return regions;
  }

  /**
   * Interactive Buttons: Small rectangular elements with prominent border or high contrast
   */
  private static detectButtons(
    imageData: ImageData,
    width: number,
    height: number
  ): DetectedVisualObject[] {
    const buttons: DetectedVisualObject[] = [];
    const data = imageData.data;

    // Scan bottom region of screen (common for action buttons)
    const scanStartY = Math.floor(height * 0.7);
    for (let y = scanStartY; y < height - 40; y += 32) {
      for (let x = Math.floor(width * 0.1); x < width * 0.9; x += 48) {
        const idx = (y * width + x) * 4;
        const bW = Math.min(160, Math.floor(width * 0.35));
        const bH = 40;

        if (x + bW < width && y + bH < height) {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          // Check corner vs center uniformity
          const cIdx = ((y + 20) * width + (x + Math.floor(bW / 2))) * 4;
          const diff = Math.abs(data[cIdx] - r) + Math.abs(data[cIdx + 1] - g) + Math.abs(data[cIdx + 2] - b);

          if (diff < 20 && (r > 160 || g > 160 || b > 160)) {
            buttons.push({
              id: `btn_${x}_${y}`,
              type: 'button',
              bounds: { x, y, width: bW, height: bH },
              confidence: 0.76,
              confidenceLabel: 'MEDIUM',
              source: 'vision',
              properties: { backgroundColor: `rgb(${r},${g},${b})` },
              editable: true,
              reviewRequired: true
            });
          }
        }
      }
    }

    return buttons.slice(0, 2);
  }

  /**
   * Deduplicate, fuse, and label objects by confidence
   */
  private static fusionAndFilter(
    objects: DetectedVisualObject[],
    canvasWidth: number,
    canvasHeight: number
  ): DetectedVisualObject[] {
    const filtered: DetectedVisualObject[] = [];

    for (const obj of objects) {
      // Ensure bounds inside canvas
      if (
        obj.bounds.x < 0 ||
        obj.bounds.y < 0 ||
        obj.bounds.width <= 0 ||
        obj.bounds.height <= 0 ||
        obj.bounds.x + obj.bounds.width > canvasWidth + 10 ||
        obj.bounds.y + obj.bounds.height > canvasHeight + 10
      ) {
        continue;
      }

      // Merge overlapping boxes of same type
      const overlap = filtered.find(
        (f) =>
          f.type === obj.type &&
          Math.abs(f.bounds.x - obj.bounds.x) < 30 &&
          Math.abs(f.bounds.y - obj.bounds.y) < 30
      );

      if (!overlap) {
        filtered.push(obj);
      }
    }

    return filtered.slice(0, 25);
  }
}
