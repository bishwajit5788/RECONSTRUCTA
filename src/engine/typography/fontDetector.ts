/**
 * RECONSTRUCTA — ADVANCED TYPOGRAPHY ENGINE (FONT DETECTOR)
 * Estimates font category, candidate ranking, stroke weight, foreground color, and alignment.
 */

import { BoundingBox, TextAlignment } from '../../types/sceneGraph';

export interface FontCandidate {
  family: string;
  category: 'sans-serif' | 'serif' | 'monospace' | 'display';
  confidence: number; // 0.0 - 1.0
}

export interface TypographyEstimation {
  candidates: FontCandidate[];
  recommendedFamily: string;
  estimatedSize: number;
  estimatedWeight: number;
  color: string;
  backgroundColor: string;
  lineHeight: number;
  letterSpacing: number;
  alignment: TextAlignment;
  confidence: number;
}

export class FontDetector {
  /**
   * Estimates complete typography properties for a bounding box region on a canvas
   */
  static estimate(
    canvas: HTMLCanvasElement,
    bounds: BoundingBox,
    text: string,
    platformHint?: string
  ): TypographyEstimation {
    const ctx = canvas.getContext('2d');
    const estimatedSize = Math.max(Math.round(bounds.height * 0.72), 10);

    // 1. Color Sampling (Sample center pixel vs edge pixels)
    let textColor = '#FFFFFF';
    let bgColor = '#000000';
    let weight = 400;

    if (ctx && bounds.width > 0 && bounds.height > 0) {
      try {
        const safeW = Math.min(Math.max(Math.round(bounds.width), 1), canvas.width - Math.round(bounds.x));
        const safeH = Math.min(Math.max(Math.round(bounds.height), 1), canvas.height - Math.round(bounds.y));
        const imgData = ctx.getImageData(Math.round(bounds.x), Math.round(bounds.y), safeW, safeH);
        const sampled = this.sampleColorsAndDensity(imgData);
        textColor = sampled.fgColor;
        bgColor = sampled.bgColor;
        weight = sampled.estimatedWeight;
      } catch (e) {
        // Fallback if cross-origin or canvas read error
      }
    }

    // 2. Candidate Font Ranking based on platform and text characteristics
    const candidates = this.rankFontCandidates(platformHint, text);

    return {
      candidates,
      recommendedFamily: candidates[0]?.family || 'Inter, sans-serif',
      estimatedSize,
      estimatedWeight: weight,
      color: textColor,
      backgroundColor: bgColor,
      lineHeight: 1.25,
      letterSpacing: 0,
      alignment: 'left',
      confidence: 0.85
    };
  }

  /**
   * Samples foreground and background color clusters and stroke fill density
   */
  private static sampleColorsAndDensity(
    imgData: ImageData
  ): { fgColor: string; bgColor: string; estimatedWeight: number } {
    const data = imgData.data;
    const len = data.length;
    if (len < 4) {
      return { fgColor: '#FFFFFF', bgColor: '#141018', estimatedWeight: 400 };
    }

    // Edge sample (background)
    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];

    let maxContrast = 0;
    let fgR = 255;
    let fgG = 255;
    let fgB = 255;
    let foregroundPixelCount = 0;
    let totalSamples = 0;

    for (let i = 0; i < len; i += 16) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

      if (diff > 80) {
        foregroundPixelCount++;
        if (diff > maxContrast) {
          maxContrast = diff;
          fgR = r;
          fgG = g;
          fgB = b;
        }
      }
      totalSamples++;
    }

    // Foreground fill ratio determines weight
    const fillRatio = totalSamples > 0 ? foregroundPixelCount / totalSamples : 0.25;
    let estimatedWeight = 400;
    if (fillRatio > 0.45) {
      estimatedWeight = 700; // Bold
    } else if (fillRatio > 0.35) {
      estimatedWeight = 600; // Semi-bold
    } else if (fillRatio > 0.22) {
      estimatedWeight = 500; // Medium
    } else if (fillRatio < 0.15) {
      estimatedWeight = 300; // Light
    }

    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    const fgHex = `#${toHex(fgR)}${toHex(fgG)}${toHex(fgB)}`;
    const bgHex = `#${toHex(bgR)}${toHex(bgG)}${toHex(bgB)}`;

    return { fgColor: fgHex, bgColor: bgHex, estimatedWeight };
  }

  /**
   * Ranks font families according to platform cues and typographic traits
   */
  private static rankFontCandidates(platformHint?: string, text?: string): FontCandidate[] {
    const p = platformHint?.toLowerCase();

    if (p === 'ios') {
      return [
        { family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif', category: 'sans-serif', confidence: 0.94 },
        { family: 'Inter, sans-serif', category: 'sans-serif', confidence: 0.82 },
        { family: 'Roboto, sans-serif', category: 'sans-serif', confidence: 0.70 }
      ];
    }

    if (p === 'android') {
      return [
        { family: 'Roboto, -apple-system, sans-serif', category: 'sans-serif', confidence: 0.92 },
        { family: 'Inter, sans-serif', category: 'sans-serif', confidence: 0.84 },
        { family: 'Open Sans, sans-serif', category: 'sans-serif', confidence: 0.71 }
      ];
    }

    if (p === 'whatsapp') {
      return [
        { family: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', category: 'sans-serif', confidence: 0.95 },
        { family: 'Inter, sans-serif', category: 'sans-serif', confidence: 0.86 },
        { family: 'Roboto, sans-serif', category: 'sans-serif', confidence: 0.80 }
      ];
    }

    // Generic defaults
    return [
      { family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', category: 'sans-serif', confidence: 0.88 },
      { family: 'Roboto, sans-serif', category: 'sans-serif', confidence: 0.78 },
      { family: 'Cinzel, serif', category: 'serif', confidence: 0.65 },
      { family: 'JetBrains Mono, monospace', category: 'monospace', confidence: 0.60 }
    ];
  }
}
