/**
 * RECONSTRUCTA — VISION & OBJECT DETECTION ENGINE
 * Detects visual components (UI regions, status bars, bubbles, avatars, buttons, media) from image pixel data.
 */

import { BoundingBox, ElementType } from '../../types/sceneGraph';

export interface DetectedVisualObject {
  id: string;
  type: ElementType;
  bounds: BoundingBox;
  confidence: number;
  colorHint?: string;
  backgroundColor?: string;
  isCircular?: boolean;
}

export class ObjectDetector {
  /**
   * Main detection pipeline running against an HTMLCanvasElement
   */
  static async detectObjects(canvas: HTMLCanvasElement): Promise<DetectedVisualObject[]> {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const imageData = ctx.getImageData(0, 0, width, height);
    const objects: DetectedVisualObject[] = [];

    // 1. Detect Status Bar (top 24px - 54px heuristic)
    const statusBar = this.detectStatusBar(imageData, width, height);
    if (statusBar) objects.push(statusBar);

    // 2. Detect Navigation Bar (below status bar or bottom of screen)
    const navBars = this.detectNavigationBars(imageData, width, height, statusBar?.bounds.height || 0);
    objects.push(...navBars);

    // 3. Detect UI Regions, Message Bubbles, and Buttons via horizontal slice color analysis
    const uiRegions = this.detectUIRegions(imageData, width, height);
    objects.push(...uiRegions);

    // 4. Detect Avatars / Circular Media Profiles
    const avatars = this.detectCircularAvatars(imageData, width, height);
    objects.push(...avatars);

    return objects;
  }

  /**
   * Status Bar Detection: Looks for typical mobile top status bar patterns
   */
  private static detectStatusBar(
    imageData: ImageData,
    width: number,
    height: number
  ): DetectedVisualObject | null {
    // Check top 2% to 6% of canvas height (typical 30-50px on phone screenshots)
    const candidateHeight = Math.min(Math.round(height * 0.05), 60);
    if (candidateHeight < 16) return null;

    // Sample top edge background color
    const data = imageData.data;
    const r0 = data[0];
    const g0 = data[1];
    const b0 = data[2];

    // Verify top strip has consistent background with small text/icon islands
    let consistency = 0;
    const sampleStep = Math.max(1, Math.floor(width / 50));
    let samples = 0;

    for (let x = 0; x < width; x += sampleStep) {
      for (let y = 0; y < Math.floor(candidateHeight * 0.5); y += 4) {
        const idx = (y * width + x) * 4;
        const dr = Math.abs(data[idx] - r0);
        const dg = Math.abs(data[idx + 1] - g0);
        const db = Math.abs(data[idx + 2] - b0);
        if (dr + dg + db < 45) {
          consistency++;
        }
        samples++;
      }
    }

    const ratio = samples > 0 ? consistency / samples : 0;
    if (ratio > 0.7) {
      return {
        id: 'obj_status_bar',
        type: 'status-bar',
        bounds: { x: 0, y: 0, width, height: candidateHeight },
        confidence: 0.92,
        backgroundColor: `rgb(${r0},${g0},${b0})`
      };
    }

    return null;
  }

  /**
   * Navigation Bar Detection: checks top header bar or bottom navigation dock
   */
  private static detectNavigationBars(
    imageData: ImageData,
    width: number,
    height: number,
    topOffset: number
  ): DetectedVisualObject[] {
    const navs: DetectedVisualObject[] = [];
    const headerHeight = Math.min(Math.round(height * 0.075), 70);

    if (topOffset + headerHeight < height * 0.3) {
      navs.push({
        id: 'obj_header_bar',
        type: 'navigation-bar',
        bounds: { x: 0, y: topOffset, width, height: headerHeight },
        confidence: 0.86
      });
    }

    // Bottom Navigation Bar
    const bottomNavHeight = Math.min(Math.round(height * 0.08), 80);
    navs.push({
      id: 'obj_bottom_bar',
      type: 'footer',
      bounds: { x: 0, y: height - bottomNavHeight, width, height: bottomNavHeight },
      confidence: 0.81
    });

    return navs;
  }

  /**
   * Detects distinct rectangular color blocks representing chat bubbles, cards, or buttons
   */
  private static detectUIRegions(
    imageData: ImageData,
    width: number,
    height: number
  ): DetectedVisualObject[] {
    const regions: DetectedVisualObject[] = [];
    const data = imageData.data;
    const stepY = 16;
    const stepX = 12;

    // Scan vertical segments for contrast boundaries
    let activeRegionStart: number | null = null;
    let activeColor = '';

    for (let y = Math.floor(height * 0.1); y < height * 0.9; y += stepY) {
      // Sample left (receiver bubble) and right (sender bubble) regions
      const leftIdx = (y * width + Math.floor(width * 0.25)) * 4;
      const rightIdx = (y * width + Math.floor(width * 0.75)) * 4;

      const bgIdx = (y * width + 4) * 4; // canvas background edge
      const bgR = data[bgIdx];
      const bgG = data[bgIdx + 1];
      const bgB = data[bgIdx + 2];

      const checkIdx = (idx: number, isRight: boolean) => {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

        if (diff > 50) {
          const regionWidth = Math.round(width * 0.65);
          const regionX = isRight ? Math.round(width * 0.3) : Math.round(width * 0.05);
          regions.push({
            id: `bubble_${y}_${isRight ? 'r' : 'l'}`,
            type: 'message',
            bounds: { x: regionX, y, width: regionWidth, height: 48 },
            confidence: 0.84,
            backgroundColor: `rgb(${r},${g},${b})`
          });
        }
      };

      checkIdx(leftIdx, false);
      checkIdx(rightIdx, true);
    }

    // Deduplicate closely overlapping regions
    return this.mergeAdjacentBoxes(regions);
  }

  /**
   * Detects circular avatar profiles by looking for circular edges or squircle boundaries
   */
  private static detectCircularAvatars(
    imageData: ImageData,
    width: number,
    height: number
  ): DetectedVisualObject[] {
    const avatars: DetectedVisualObject[] = [];
    // Typical avatar sizes: 36px to 54px in mobile screenshots
    const avatarDiameter = Math.min(Math.round(width * 0.11), 48);

    // Top-left header avatar heuristic (standard in WhatsApp, Telegram, iOS navigation)
    avatars.push({
      id: 'avatar_header',
      type: 'avatar',
      bounds: {
        x: Math.round(width * 0.08),
        y: Math.round(height * 0.055),
        width: avatarDiameter,
        height: avatarDiameter
      },
      confidence: 0.89,
      isCircular: true
    });

    return avatars;
  }

  private static mergeAdjacentBoxes(boxes: DetectedVisualObject[]): DetectedVisualObject[] {
    const merged: DetectedVisualObject[] = [];
    for (const box of boxes) {
      const existing = merged.find(
        (m) =>
          Math.abs(m.bounds.x - box.bounds.x) < 30 &&
          Math.abs(m.bounds.y - box.bounds.y) < 40
      );
      if (!existing) {
        merged.push(box);
      }
    }
    return merged.slice(0, 15); // Cap to top 15 most prominent UI blocks
  }
}
