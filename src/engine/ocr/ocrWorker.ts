/**
 * RECONSTRUCTA — BROWSER OCR WORKER ENGINE
 * Interfaces with Tesseract.js in non-blocking worker threads.
 */

import { createWorker, Worker } from 'tesseract.js';
import { BoundingBox } from '../../types/sceneGraph';

export interface OCRProgressCallback {
  (progress: number, status: string): void;
}

export interface OCRWordResult {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface OCRLineResult {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  words: OCRWordResult[];
  baseline?: { x0: number; y0: number; x1: number; y1: number };
}

export interface OCRBlockResult {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  lines: OCRLineResult[];
}

export interface OCRScanResult {
  blocks: OCRBlockResult[];
  overallConfidence: number;
  fullText: string;
  processingTimeMs: number;
}

export class OCRWorkerManager {
  private static workerInstance: Worker | null = null;
  private static isInitializing = false;

  /**
   * Lazy initializes the Tesseract.js worker
   */
  private static async getWorker(onProgress?: OCRProgressCallback): Promise<Worker> {
    if (this.workerInstance) {
      return this.workerInstance;
    }

    this.isInitializing = true;
    onProgress?.(0.1, 'Initializing OCR worker...');

    const worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          onProgress?.(Math.min(0.2 + m.progress * 0.75, 0.95), `Recognizing text (${Math.round(m.progress * 100)}%)...`);
        } else {
          onProgress?.(0.15, m.status);
        }
      }
    });

    this.workerInstance = worker;
    this.isInitializing = false;
    return worker;
  }

  /**
   * Scans a full canvas or cropped image source
   */
  static async scanImage(
    source: HTMLCanvasElement | ImageData | string,
    cropBounds?: BoundingBox,
    onProgress?: OCRProgressCallback
  ): Promise<OCRScanResult> {
    const startTime = performance.now();
    let targetSource = source;

    // If a crop region was provided on a canvas, crop it first
    if (cropBounds && source instanceof HTMLCanvasElement) {
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = Math.max(cropBounds.width, 10);
      croppedCanvas.height = Math.max(cropBounds.height, 10);
      const ctx = croppedCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          source,
          cropBounds.x,
          cropBounds.y,
          cropBounds.width,
          cropBounds.height,
          0,
          0,
          cropBounds.width,
          cropBounds.height
        );
        targetSource = croppedCanvas;
      }
    }

    try {
      const worker = await this.getWorker(onProgress);
      onProgress?.(0.3, 'Analyzing layout and typography...');

      const result = await worker.recognize(targetSource as any);
      onProgress?.(0.98, 'Structuring scene nodes...');

      const blocks: OCRBlockResult[] = [];
      const offsetX = cropBounds?.x || 0;
      const offsetY = cropBounds?.y || 0;

      const pageBlocks = (result.data as any).blocks || [];

      for (const block of pageBlocks) {
        const lines: OCRLineResult[] = [];
        for (const line of block.lines || []) {
          const words: OCRWordResult[] = [];
          for (const word of line.words || []) {
            words.push({
              text: word.text.trim(),
              confidence: word.confidence / 100,
              bbox: {
                x: word.bbox.x0 + offsetX,
                y: word.bbox.y0 + offsetY,
                width: word.bbox.x1 - word.bbox.x0,
                height: word.bbox.y1 - word.bbox.y0
              }
            });
          }

          lines.push({
            text: line.text.trim(),
            confidence: line.confidence / 100,
            bbox: {
              x: line.bbox.x0 + offsetX,
              y: line.bbox.y0 + offsetY,
              width: line.bbox.x1 - line.bbox.x0,
              height: line.bbox.y1 - line.bbox.y0
            },
            words,
            baseline: line.baseline
          });
        }

        blocks.push({
          text: block.text.trim(),
          confidence: block.confidence / 100,
          bbox: {
            x: block.bbox.x0 + offsetX,
            y: block.bbox.y0 + offsetY,
            width: block.bbox.x1 - block.bbox.x0,
            height: block.bbox.y1 - block.bbox.y0
          },
          lines
        });
      }

      onProgress?.(1.0, 'Completed');
      const endTime = performance.now();

      return {
        blocks,
        overallConfidence: (result.data.confidence || 90) / 100,
        fullText: result.data.text,
        processingTimeMs: Math.round(endTime - startTime)
      };
    } catch (err: any) {
      console.error('OCR Worker Error:', err);
      throw new Error(`OCR processing failed: ${err?.message || 'Unknown worker error'}`);
    }
  }

  /**
   * Graceful worker cleanup
   */
  static async terminate(): Promise<void> {
    if (this.workerInstance) {
      await this.workerInstance.terminate();
      this.workerInstance = null;
    }
  }
}
