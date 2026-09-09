/**
 * RECONSTRUCTA — PLATFORM ADAPTER TYPES
 */

import { ElementType, LayoutConstraints } from './sceneGraph';

export type PlatformId =
  | 'generic'
  | 'whatsapp'
  | 'telegram'
  | 'instagram'
  | 'snapchat'
  | 'email'
  | 'ios'
  | 'android';

export interface PlatformVisualHints {
  primaryColor?: string;
  headerBackground?: string;
  sentBubbleColor?: string;
  receivedBubbleColor?: string;
  fontFamily: string;
  defaultFontSize: number;
  statusBarHeight: number;
  navigationBarHeight: number;
}

export interface PlatformDetectionResult {
  platformId: PlatformId;
  confidence: number;
  detectedFeatures: string[];
  suggestedTheme: 'light' | 'dark';
}

export interface PlatformAdapter {
  id: PlatformId;
  name: string;
  visualHints: PlatformVisualHints;
  detect: (canvas: HTMLCanvasElement, textContent: string[]) => Promise<PlatformDetectionResult | null>;
  getDefaultConstraints: (type: ElementType) => LayoutConstraints;
  getTypographyDefaults: (type: ElementType) => {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    color: string;
  };
}
