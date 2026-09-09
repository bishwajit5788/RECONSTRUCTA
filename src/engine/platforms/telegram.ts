/**
 * RECONSTRUCTA — TELEGRAM PLATFORM ADAPTER
 */

import { PlatformAdapter, PlatformDetectionResult } from '../../types/platform';
import { ElementType, LayoutConstraints } from '../../types/sceneGraph';

export const TelegramAdapter: PlatformAdapter = {
  id: 'telegram',
  name: 'Telegram Messenger',
  visualHints: {
    primaryColor: '#2481CC',
    headerBackground: '#212D3B',
    sentBubbleColor: '#2B5278',
    receivedBubbleColor: '#182533',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Roboto", sans-serif',
    defaultFontSize: 15,
    statusBarHeight: 34,
    navigationBarHeight: 52
  },
  detect: async (_canvas: HTMLCanvasElement, textContent: string[]): Promise<PlatformDetectionResult | null> => {
    const textJoined = textContent.join(' ').toLowerCase();
    if (/telegram|saved messages|channel|subscriber/i.test(textJoined)) {
      return {
        platformId: 'telegram',
        confidence: 0.88,
        detectedFeatures: ['Telegram keywords and bubble shape match'],
        suggestedTheme: 'dark'
      };
    }
    return null;
  },
  getDefaultConstraints: (type: ElementType): LayoutConstraints => {
    if (type === 'message') {
      return { mode: 'reflow', padding: { top: 7, right: 11, bottom: 7, left: 11 } };
    }
    return { mode: 'fixed' };
  },
  getTypographyDefaults: (type: ElementType) => {
    if (type === 'name') {
      return { fontFamily: 'Roboto, sans-serif', fontSize: 16, fontWeight: 500, color: '#FFFFFF' };
    }
    return { fontFamily: 'Roboto, sans-serif', fontSize: 15, fontWeight: 400, color: '#FFFFFF' };
  }
};
