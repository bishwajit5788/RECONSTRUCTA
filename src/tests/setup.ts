/**
 * RECONSTRUCTA — TEST SETUP & CANVAS POLYFILL
 */

import '@testing-library/jest-dom';
import '@testing-library/jest-dom/vitest';

// Polyfill HTMLCanvasElement.prototype.getContext for JSDOM
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function (this: any, contextType: string) {
    if (contextType === '2d') {
      return {
        canvas: this,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        font: '14px Inter',
        fillRect: () => {},
        clearRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        fillText: () => {},
        strokeText: () => {},
        arc: () => {},
        arcTo: () => {},
        roundRect: () => {},
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        measureText: function (text: string) {
          const match = (this.font || '').match(/(\d+(?:\.\d+)?)px/);
          const size = match ? parseFloat(match[1]) : 14;
          return {
            width: text.length * (size * 0.55),
            actualBoundingBoxAscent: size * 0.8,
            actualBoundingBoxDescent: size * 0.2
          };
        },
        getImageData: (x: number, y: number, w: number, h: number) => {
          const clampedW = Math.max(1, Math.round(w));
          const clampedH = Math.max(1, Math.round(h));
          const data = new Uint8ClampedArray(clampedW * clampedH * 4);
          // Fill sample foreground and background
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 20;     // R
            data[i + 1] = 16; // G
            data[i + 2] = 24; // B
            data[i + 3] = 255;
          }
          return { data, width: clampedW, height: clampedH };
        },
        putImageData: () => {},
        setTransform: () => {},
        resetTransform: () => {}
      } as any;
    }
    return null;
  } as any;

  HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  };

  HTMLCanvasElement.prototype.toBlob = function (callback: (blob: Blob | null) => void, type?: string) {
    const dummyBlob = new Blob(['sample-png-bytes'], { type: type || 'image/png' });
    callback(dummyBlob);
  };
}
