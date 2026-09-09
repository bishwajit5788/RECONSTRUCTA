/**
 * RECONSTRUCTA — TYPOGRAPHY & ITERATIVE FITTER TEST SUITE
 */

import { describe, it, expect } from 'vitest';
import { IterativeFitter } from '../engine/typography/iterativeFitter';
import { FontDetector } from '../engine/typography/fontDetector';

describe('Typography Engine', () => {
  it('ranks platform font candidates appropriately for iOS and Android', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 800;

    const iosEstimate = FontDetector.estimate(
      canvas,
      { x: 20, y: 30, width: 200, height: 30 },
      'Hello iOS',
      'ios'
    );
    expect(iosEstimate.candidates[0].family).toContain('SF Pro');

    const androidEstimate = FontDetector.estimate(
      canvas,
      { x: 20, y: 30, width: 200, height: 30 },
      'Hello Android',
      'android'
    );
    expect(androidEstimate.candidates[0].family).toContain('Roboto');
  });

  it('iteratively fits oversized text to target width bounds', () => {
    const longText = 'This is a longer replacement title';
    const targetBounds = { x: 0, y: 0, width: 220, height: 32 };

    const result = IterativeFitter.fitTextToBounds(
      longText,
      targetBounds,
      'Inter, sans-serif',
      400,
      8,
      5.0
    );

    expect(result.fontSize).toBeDefined();
    expect(result.fontSize).toBeGreaterThanOrEqual(8);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.renderedWidth).toBeLessThanOrEqual(targetBounds.width + 10);
  });
});
