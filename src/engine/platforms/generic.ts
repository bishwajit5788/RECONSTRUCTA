/**
 * RECONSTRUCTA — GENERIC PLATFORM ADAPTER
 * Default fallback adapter for general screenshots, documents, and mockups.
 */

import { PlatformAdapter, PlatformDetectionResult } from '../../types/platform';
import { ElementType, LayoutConstraints } from '../../types/sceneGraph';

export const GenericAdapter: PlatformAdapter = {
  id: 'generic',
  name: 'Generic Visual Layout',
  visualHints: {
    fontFamily: 'Inter, -apple-system, sans-serif',
    defaultFontSize: 14,
    statusBarHeight: 0,
    navigationBarHeight: 48
  },
  detect: async (_canvas: HTMLCanvasElement, _textContent: string[]): Promise<PlatformDetectionResult> => {
    return {
      platformId: 'generic',
      confidence: 0.5,
      detectedFeatures: ['Standard rectangular layout'],
      suggestedTheme: 'dark'
    };
  },
  getDefaultConstraints: (type: ElementType): LayoutConstraints => {
    if (type === 'message') {
      return { mode: 'auto', padding: { top: 8, right: 12, bottom: 8, left: 12 } };
    }
    if (type === 'timestamp') {
      return { mode: 'anchor', anchor: 'bottom-right' };
    }
    return { mode: 'fixed' };
  },
  getTypographyDefaults: (type: ElementType) => {
    if (type === 'heading') {
      return { fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 600, color: '#F4EFE6' };
    }
    if (type === 'timestamp') {
      return { fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 400, color: '#9D96A5' };
    }
    return { fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 400, color: '#F4EFE6' };
  }
};
