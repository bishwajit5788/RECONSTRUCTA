/**
 * RECONSTRUCTA — PLATFORM ADAPTER REGISTRY
 * Manages platform adapters, automatic recognition, and generic fallback.
 */

import { PlatformAdapter, PlatformId, PlatformDetectionResult } from '../../types/platform';
import { GenericAdapter } from './generic';
import { WhatsAppAdapter } from './whatsapp';
import { TelegramAdapter } from './telegram';
import { IOSAdapter } from './ios';
import { AndroidAdapter, EmailAdapter, InstagramAdapter, SnapchatAdapter } from './additionalAdapters';

export class PlatformRegistry {
  private static adapters: Map<PlatformId, PlatformAdapter> = new Map([
    ['generic', GenericAdapter],
    ['whatsapp', WhatsAppAdapter],
    ['telegram', TelegramAdapter],
    ['ios', IOSAdapter],
    ['android', AndroidAdapter],
    ['email', EmailAdapter],
    ['instagram', InstagramAdapter],
    ['snapchat', SnapchatAdapter]
  ]);

  static get(id: PlatformId): PlatformAdapter {
    return this.adapters.get(id) || GenericAdapter;
  }

  static getAll(): PlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Detects the most likely platform given the canvas and extracted text content
   */
  static async detectPlatform(
    canvas: HTMLCanvasElement,
    textContent: string[]
  ): Promise<PlatformDetectionResult> {
    let bestResult: PlatformDetectionResult = {
      platformId: 'generic',
      confidence: 0.5,
      detectedFeatures: ['Default generic visual canvas'],
      suggestedTheme: 'dark'
    };

    for (const adapter of this.adapters.values()) {
      if (adapter.id === 'generic') continue;
      try {
        const result = await adapter.detect(canvas, textContent);
        if (result && result.confidence > bestResult.confidence) {
          bestResult = result;
        }
      } catch (err) {
        console.warn(`Error running detector for ${adapter.name}:`, err);
      }
    }

    return bestResult;
  }
}
