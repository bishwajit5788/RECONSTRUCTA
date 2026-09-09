/**
 * RECONSTRUCTA — ITERATIVE TYPOGRAPHY FITTER
 * Binary search fitting loop that iteratively tunes fontSize, letterSpacing, and lineHeight
 * to fit replacement text within desired or original visual bounds.
 */

import { BoundingBox } from '../../types/sceneGraph';

export interface IterativeFitResult {
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  iterations: number;
  toleranceDelta: number;
}

export class IterativeFitter {
  private static measurementCanvas: HTMLCanvasElement | null = null;
  private static measurementCtx: CanvasRenderingContext2D | null = null;

  private static getContext(): CanvasRenderingContext2D {
    if (!this.measurementCtx) {
      this.measurementCanvas = document.createElement('canvas');
      this.measurementCtx = this.measurementCanvas.getContext('2d')!;
    }
    return this.measurementCtx;
  }

  /**
   * Iteratively fits replacement text to match a target bounding box
   */
  static fitTextToBounds(
    text: string,
    targetBounds: BoundingBox,
    fontFamily: string = 'Inter, sans-serif',
    fontWeight: number = 400,
    maxIterations: number = 8,
    tolerancePx: number = 2.0
  ): IterativeFitResult {
    const ctx = this.getContext();
    const targetW = targetBounds.width;
    const targetH = targetBounds.height;

    // Initial estimation
    let minSize = 8;
    let maxSize = Math.max(targetH * 1.5, 48);
    let currentSize = Math.max(Math.round(targetH * 0.72), 12);
    let letterSpacing = 0;
    let lineHeight = 1.2;

    let iterations = 0;
    let bestDelta = Infinity;
    let bestResult = {
      fontSize: currentSize,
      letterSpacing,
      lineHeight,
      renderedWidth: targetW,
      renderedHeight: targetH,
      iterations: 0,
      toleranceDelta: 0
    };

    while (iterations < maxIterations) {
      iterations++;
      ctx.font = `${fontWeight} ${currentSize}px ${fontFamily}`;

      // Measure single line width
      const metrics = ctx.measureText(text);
      const measuredW = metrics.width + (text.length - 1) * letterSpacing;
      const measuredH = currentSize * lineHeight;

      const deltaW = measuredW - targetW;
      const absDelta = Math.abs(deltaW);

      if (absDelta < bestDelta) {
        bestDelta = absDelta;
        bestResult = {
          fontSize: currentSize,
          letterSpacing,
          lineHeight,
          renderedWidth: Math.round(measuredW),
          renderedHeight: Math.round(measuredH),
          iterations,
          toleranceDelta: Math.round(bestDelta * 10) / 10
        };
      }

      if (absDelta <= tolerancePx) {
        break;
      }

      // Binary search adjustment for size
      if (deltaW > 0) {
        // Text overflows -> decrease font size or tighten letter spacing
        maxSize = currentSize;
        currentSize = Math.max(minSize, Math.floor((minSize + currentSize) / 2));
        if (currentSize === minSize) {
          // Fine tune letter spacing if size hits floor
          letterSpacing = Math.max(letterSpacing - 0.2, -1.0);
        }
      } else {
        // Text underflows -> increase font size
        minSize = currentSize;
        currentSize = Math.min(maxSize, Math.ceil((currentSize + maxSize) / 2));
      }

      if (maxSize - minSize <= 1) {
        // Final micro-step on letter spacing
        const remainingDeficit = targetW - measuredW;
        if (text.length > 1) {
          letterSpacing = Math.max(-1.0, Math.min(2.0, remainingDeficit / (text.length - 1)));
        }
        break;
      }
    }

    return bestResult;
  }
}
