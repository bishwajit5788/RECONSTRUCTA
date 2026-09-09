/**
 * RECONSTRUCTA — IOS PLATFORM ADAPTER
 */

import { PlatformAdapter, PlatformDetectionResult } from '../../types/platform';
import { ElementType, LayoutConstraints } from '../../types/sceneGraph';

export const IOSAdapter: PlatformAdapter = {
  id: 'ios',
  name: 'Apple iOS (SF Pro)',
  visualHints: {
    primaryColor: '#007AFF',
    headerBackground: '#1C1C1E',
    sentBubbleColor: '#0A84FF',
    receivedBubbleColor: '#2C2C2E',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
    defaultFontSize: 16,
    statusBarHeight: 48,
    navigationBarHeight: 44
  },
  detect: async (canvas: HTMLCanvasElement, textContent: string[]): Promise<PlatformDetectionResult | null> => {
    let score = 0;
    const features: string[] = [];

    // Aspect ratio check for modern iPhones (approx 19.5:9 -> height/width around 2.16)
    const ratio = canvas.height / canvas.width;
    if (ratio > 2.05 && ratio < 2.25) {
      score += 0.35;
      features.push('iPhone 19.5:9 display aspect ratio');
    }

    // Top status bar check for time (e.g. 9:41)
    const textJoined = textContent.join(' ');
    if (/\b(?:9:41|\d{1,2}:\d{2})\b/.test(textJoined)) {
      score += 0.3;
      features.push('iOS status clock format');
    }

    if (score >= 0.5) {
      return {
        platformId: 'ios',
        confidence: Math.min(score, 0.94),
        detectedFeatures: features,
        suggestedTheme: 'dark'
      };
    }
    return null;
  },
  getDefaultConstraints: (type: ElementType): LayoutConstraints => {
    if (type === 'message') {
      return { mode: 'reflow', padding: { top: 9, right: 14, bottom: 9, left: 14 } };
    }
    return { mode: 'fixed' };
  },
  getTypographyDefaults: (type: ElementType) => {
    return {
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      fontSize: type === 'heading' ? 22 : type === 'name' ? 17 : 16,
      fontWeight: type === 'name' || type === 'heading' ? 600 : 400,
      color: '#FFFFFF'
    };
  }
};
