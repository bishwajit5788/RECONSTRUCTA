/**
 * RECONSTRUCTA — WHATSAPP PLATFORM ADAPTER
 */

import { PlatformAdapter, PlatformDetectionResult } from '../../types/platform';
import { ElementType, LayoutConstraints } from '../../types/sceneGraph';

export const WhatsAppAdapter: PlatformAdapter = {
  id: 'whatsapp',
  name: 'WhatsApp Messenger',
  visualHints: {
    primaryColor: '#128C7E',
    headerBackground: '#075E54',
    sentBubbleColor: '#005C4B',     // Dark mode sent bubble
    receivedBubbleColor: '#202C33', // Dark mode received bubble
    fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    defaultFontSize: 14.5,
    statusBarHeight: 34,
    navigationBarHeight: 56
  },
  detect: async (canvas: HTMLCanvasElement, textContent: string[]): Promise<PlatformDetectionResult | null> => {
    let score = 0;
    const features: string[] = [];

    // Check for common text keywords
    const textJoined = textContent.join(' ').toLowerCase();
    if (/whatsapp|online|typing|last seen|message/i.test(textJoined)) {
      score += 0.45;
      features.push('WhatsApp keywords detected');
    }

    // Color sample top header for WhatsApp green / dark teal
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const topData = ctx.getImageData(0, 10, canvas.width, 10).data;
      let tealMatches = 0;
      for (let i = 0; i < topData.length; i += 16) {
        const r = topData[i];
        const g = topData[i + 1];
        const b = topData[i + 2];
        // #075E54 is approx (7, 94, 84) or Dark mode #202C33 (32, 44, 51)
        if ((r < 30 && g > 70 && b > 60) || (r > 20 && r < 40 && g > 35 && g < 55 && b > 40 && b < 60)) {
          tealMatches++;
        }
      }
      if (tealMatches > 20) {
        score += 0.45;
        features.push('WhatsApp header color profile matched');
      }
    }

    if (score >= 0.4) {
      return {
        platformId: 'whatsapp',
        confidence: Math.min(score, 0.96),
        detectedFeatures: features,
        suggestedTheme: 'dark'
      };
    }
    return null;
  },
  getDefaultConstraints: (type: ElementType): LayoutConstraints => {
    if (type === 'message') {
      return {
        mode: 'reflow',
        padding: { top: 8, right: 12, bottom: 8, left: 12 },
        minWidth: 80,
        maxWidth: 340
      };
    }
    if (type === 'timestamp') {
      return { mode: 'anchor', anchor: 'bottom-right' };
    }
    return { mode: 'fixed' };
  },
  getTypographyDefaults: (type: ElementType) => {
    if (type === 'name') {
      return {
        fontFamily: '-apple-system, Roboto, sans-serif',
        fontSize: 16,
        fontWeight: 600,
        color: '#E9EDEF'
      };
    }
    if (type === 'timestamp') {
      return {
        fontFamily: '-apple-system, Roboto, sans-serif',
        fontSize: 11,
        fontWeight: 400,
        color: '#8696A0'
      };
    }
    return {
      fontFamily: '-apple-system, Roboto, sans-serif',
      fontSize: 14.5,
      fontWeight: 400,
      color: '#E9EDEF'
    };
  }
};
