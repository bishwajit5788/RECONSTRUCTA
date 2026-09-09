/**
 * RECONSTRUCTA — ANDROID, EMAIL, INSTAGRAM, & SNAPCHAT PLATFORM ADAPTERS
 */

import { PlatformAdapter, PlatformDetectionResult } from '../../types/platform';
import { ElementType, LayoutConstraints } from '../../types/sceneGraph';

export const AndroidAdapter: PlatformAdapter = {
  id: 'android',
  name: 'Google Android (Roboto / Material You)',
  visualHints: {
    primaryColor: '#6750A4',
    headerBackground: '#141218',
    sentBubbleColor: '#4A4458',
    receivedBubbleColor: '#2B2930',
    fontFamily: 'Roboto, -apple-system, sans-serif',
    defaultFontSize: 15,
    statusBarHeight: 38,
    navigationBarHeight: 48
  },
  detect: async (_canvas: HTMLCanvasElement, textContent: string[]): Promise<PlatformDetectionResult | null> => {
    const textJoined = textContent.join(' ').toLowerCase();
    if (/android|google|pixel|galaxy|samsung/i.test(textJoined)) {
      return {
        platformId: 'android',
        confidence: 0.86,
        detectedFeatures: ['Android system cues detected'],
        suggestedTheme: 'dark'
      };
    }
    return null;
  },
  getDefaultConstraints: () => ({ mode: 'fixed' }),
  getTypographyDefaults: (type: ElementType) => ({
    fontFamily: 'Roboto, sans-serif',
    fontSize: type === 'heading' ? 20 : 15,
    fontWeight: 400,
    color: '#E6E1E5'
  })
};

export const EmailAdapter: PlatformAdapter = {
  id: 'email',
  name: 'Email Client (EML / Webmail)',
  visualHints: {
    primaryColor: '#1A73E8',
    headerBackground: '#202124',
    fontFamily: 'Inter, Roboto, Arial, sans-serif',
    defaultFontSize: 14,
    statusBarHeight: 0,
    navigationBarHeight: 56
  },
  detect: async (_canvas: HTMLCanvasElement, textContent: string[]): Promise<PlatformDetectionResult | null> => {
    const textJoined = textContent.join(' ').toLowerCase();
    if (/from:|to:|subject:|cc:|date:|inbox|unsubscribe/i.test(textJoined)) {
      return {
        platformId: 'email',
        confidence: 0.94,
        detectedFeatures: ['Email header fields (From/To/Subject) detected'],
        suggestedTheme: 'dark'
      };
    }
    return null;
  },
  getDefaultConstraints: () => ({ mode: 'reflow' }),
  getTypographyDefaults: (type: ElementType) => ({
    fontFamily: 'Inter, Arial, sans-serif',
    fontSize: type === 'heading' ? 18 : 14,
    fontWeight: type === 'heading' ? 600 : 400,
    color: '#E8EAED'
  })
};

export const InstagramAdapter: PlatformAdapter = {
  id: 'instagram',
  name: 'Instagram Direct',
  visualHints: {
    primaryColor: '#E1306C',
    headerBackground: '#000000',
    sentBubbleColor: '#3797F0',
    receivedBubbleColor: '#262626',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    defaultFontSize: 14.5,
    statusBarHeight: 44,
    navigationBarHeight: 50
  },
  detect: async (_canvas: HTMLCanvasElement, textContent: string[]): Promise<PlatformDetectionResult | null> => {
    const textJoined = textContent.join(' ').toLowerCase();
    if (/instagram|direct|reels|story|seen/i.test(textJoined)) {
      return {
        platformId: 'instagram',
        confidence: 0.89,
        detectedFeatures: ['Instagram Direct layout cues'],
        suggestedTheme: 'dark'
      };
    }
    return null;
  },
  getDefaultConstraints: () => ({ mode: 'reflow' }),
  getTypographyDefaults: () => ({
    fontFamily: '-apple-system, sans-serif',
    fontSize: 14.5,
    fontWeight: 400,
    color: '#FFFFFF'
  })
};

export const SnapchatAdapter: PlatformAdapter = {
  id: 'snapchat',
  name: 'Snapchat Chat',
  visualHints: {
    primaryColor: '#FFFC00',
    headerBackground: '#0F0F0F',
    sentBubbleColor: '#0E90E5',
    receivedBubbleColor: '#1E1E1E',
    fontFamily: 'Avenir, -apple-system, sans-serif',
    defaultFontSize: 14,
    statusBarHeight: 40,
    navigationBarHeight: 48
  },
  detect: async (_canvas: HTMLCanvasElement, textContent: string[]): Promise<PlatformDetectionResult | null> => {
    const textJoined = textContent.join(' ').toLowerCase();
    if (/snap|streak|delivered|opened|bitmoji/i.test(textJoined)) {
      return {
        platformId: 'snapchat',
        confidence: 0.88,
        detectedFeatures: ['Snapchat message patterns'],
        suggestedTheme: 'dark'
      };
    }
    return null;
  },
  getDefaultConstraints: () => ({ mode: 'fixed' }),
  getTypographyDefaults: () => ({
    fontFamily: 'Avenir, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    color: '#FFFFFF'
  })
};
