/**
 * RECONSTRUCTA — INPAINTING TEST SUITE
 */

import { describe, it, expect } from 'vitest';
import { CanvasInpaint } from '../engine/inpaint/canvasInpaint';

describe('Client Canvas Inpainting Engine', () => {
  it('restores bounding box region and generates quality evaluation', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;

    // Fill canvas background with uniform color
    ctx.fillStyle = '#201726';
    ctx.fillRect(0, 0, 200, 100);

    // Draw a high contrast text region to inpaint
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(40, 30, 80, 20);

    const bounds = { x: 40, y: 30, width: 80, height: 20 };
    const patch = CanvasInpaint.inpaintRegion(canvas, bounds, 4);

    expect(patch).toBeDefined();
    expect(patch.algorithmUsed).toBe('local_canvas');
    expect(patch.qualityScore).toBeGreaterThan(0.5);
    expect(['excellent', 'good', 'acceptable']).toContain(patch.qualityLabel);
    expect(patch.originalDataUrl).toBeDefined();
    expect(patch.restoredDataUrl).toBeDefined();
  });
});
