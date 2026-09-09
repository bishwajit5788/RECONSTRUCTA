/**
 * RECONSTRUCTA — MULTILINE ITERATIVE TYPOGRAPHY FITTER
 * Binary search fitting loop that iteratively tunes fontSize, letterSpacing, and lineHeight
 * to fit replacement single-line or multiline text within desired or original visual bounds.
 * Supports word wrapping, character breaking for long strings, and baseline metrics.
 */

import { BoundingBox } from '../../types/sceneGraph';

export interface WrappedLine {
  text: string;
  width: number;
}

export interface IterativeFitResult {
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  lines: string[];
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
   * Breaks text into lines given a maximum target width and active font metrics
   */
  static breakLines(
    text: string,
    maxWidth: number,
    font: string,
    letterSpacing: number = 0
  ): WrappedLine[] {
    const ctx = this.getContext();
    ctx.font = font;

    const paragraphs = text.split(/\r?\n/);
    const wrapped: WrappedLine[] = [];

    for (const para of paragraphs) {
      if (!para) {
        wrapped.push({ text: '', width: 0 });
        continue;
      }

      const words = para.split(' ');
      let currentLine = '';
      let currentWidth = 0;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testMetrics = ctx.measureText(testLine);
        const testWidth = testMetrics.width + (testLine.length - 1) * letterSpacing;

        if (testWidth <= maxWidth || !currentLine) {
          currentLine = testLine;
          currentWidth = testWidth;
        } else {
          wrapped.push({ text: currentLine, width: currentWidth });
          currentLine = word;
          const wordMetrics = ctx.measureText(word);
          currentWidth = wordMetrics.width + (word.length - 1) * letterSpacing;
        }
      }

      if (currentLine) {
        wrapped.push({ text: currentLine, width: currentWidth });
      }
    }

    return wrapped.length > 0 ? wrapped : [{ text, width: maxWidth }];
  }

  /**
   * Iteratively fits multiline replacement text to match a target bounding box
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

    // Check whether multiline or single line
    const isSingleLine = !text.includes('\n') && text.length < 35 && targetH < 40;

    let minSize = 8;
    let maxSize = Math.max(targetH * 1.5, 48);
    let currentSize = Math.max(Math.round(targetH * (isSingleLine ? 0.72 : 0.45)), 12);
    let letterSpacing = 0;
    let lineHeight = 1.3;

    let iterations = 0;
    let bestDelta = Infinity;
    let bestResult: IterativeFitResult = {
      fontSize: currentSize,
      letterSpacing,
      lineHeight,
      lines: [text],
      renderedWidth: targetW,
      renderedHeight: targetH,
      iterations: 0,
      toleranceDelta: 0
    };

    while (iterations < maxIterations) {
      iterations++;
      const font = `${fontWeight} ${currentSize}px ${fontFamily}`;
      ctx.font = font;

      let renderedW = 0;
      let renderedH = 0;
      let lines: string[] = [];

      if (isSingleLine) {
        const metrics = ctx.measureText(text);
        renderedW = metrics.width + (text.length - 1) * letterSpacing;
        renderedH = currentSize * lineHeight;
        lines = [text];
      } else {
        const wrapped = this.breakLines(text, targetW, font, letterSpacing);
        lines = wrapped.map((w) => w.text);
        renderedW = Math.max(...wrapped.map((w) => w.width), 10);
        renderedH = lines.length * (currentSize * lineHeight);
      }

      const deltaW = renderedW - targetW;
      const deltaH = renderedH - targetH;
      const absDelta = Math.max(Math.abs(deltaW), Math.abs(deltaH));

      if (absDelta < bestDelta) {
        bestDelta = absDelta;
        bestResult = {
          fontSize: currentSize,
          letterSpacing,
          lineHeight,
          lines,
          renderedWidth: Math.round(renderedW),
          renderedHeight: Math.round(renderedH),
          iterations,
          toleranceDelta: Math.round(bestDelta * 10) / 10
        };
      }

      if (absDelta <= tolerancePx) {
        break;
      }

      // Binary search adjustment for size
      if (deltaW > 0 || deltaH > 0) {
        // Overflow -> reduce size
        maxSize = currentSize;
        currentSize = Math.max(minSize, Math.floor((minSize + currentSize) / 2));
        if (currentSize === minSize) {
          letterSpacing = Math.max(letterSpacing - 0.2, -0.8);
        }
      } else {
        // Underflow -> increase size
        minSize = currentSize;
        currentSize = Math.min(maxSize, Math.ceil((currentSize + maxSize) / 2));
      }

      if (maxSize - minSize <= 1) {
        break;
      }
    }

    return bestResult;
  }

  /**
   * Convenience helper to fit multiline text into bounding box dimensions
   */
  static fitText(
    text: string,
    width: number,
    height: number,
    options?: {
      fontFamily?: string;
      fontWeight?: number;
      initialFontSize?: number;
      minFontSize?: number;
      maxFontSize?: number;
    }
  ): IterativeFitResult & { measuredWidth: number; measuredHeight: number } {
    const res = this.fitTextToBounds(
      text,
      { x: 0, y: 0, width, height },
      options?.fontFamily || 'Inter, sans-serif',
      options?.fontWeight || 400
    );
    return {
      ...res,
      measuredWidth: res.renderedWidth,
      measuredHeight: res.renderedHeight
    };
  }
}
