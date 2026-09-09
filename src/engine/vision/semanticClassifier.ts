/**
 * RECONSTRUCTA — SEMANTIC CLASSIFIER
 * Analyzes textual content, spatial positioning, font size, and visual containers
 * to classify elements into precise semantic roles with calibrated confidence scores.
 */

import { BoundingBox, ElementType } from '../../types/sceneGraph';

export interface SemanticClassification {
  role: ElementType;
  confidence: number;
  explanation: string;
  suggestedTags: string[];
}

export class SemanticClassifier {
  // Regex heuristics
  private static TIMESTAMP_REGEX = /^(?:\d{1,2}:\d{2}(?:\s?[apAP][mM])?|\b(?:yesterday|today|mon|tue|wed|thu|fri|sat|sun)\b(?:\s+\d{1,2}:\d{2})?|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b)/i;
  private static EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  private static URL_REGEX = /^(?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i;
  private static TIME_INLINE_REGEX = /\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b/;
  private static PHONE_REGEX = /^\+?[\d\s-()]{7,16}$/;

  /**
   * Classifies a detected region by evaluating its text, dimensions, and canvas context
   */
  static classify(
    text: string,
    bounds: BoundingBox,
    canvasDimensions: { width: number; height: number },
    containerType?: ElementType
  ): SemanticClassification {
    const trimmed = text.trim();
    const { width: cW, height: cH } = canvasDimensions;

    // 1. Email Check
    if (this.EMAIL_REGEX.test(trimmed)) {
      return {
        role: 'email',
        confidence: 0.98,
        explanation: 'Matches standard RFC email format.',
        suggestedTags: ['communication', 'address']
      };
    }

    // 2. Pure Timestamp Check
    if (this.TIMESTAMP_REGEX.test(trimmed) || (trimmed.length <= 10 && this.TIME_INLINE_REGEX.test(trimmed))) {
      return {
        role: 'timestamp',
        confidence: 0.94,
        explanation: 'Matches standard 12/24hr or date timestamp format.',
        suggestedTags: ['time', 'metadata']
      };
    }

    // 3. Status Bar Time Check (top 5% of screen and short time format)
    if (bounds.y < cH * 0.06 && this.TIME_INLINE_REGEX.test(trimmed)) {
      return {
        role: 'status-bar',
        confidence: 0.96,
        explanation: 'Located in top status bar region with active clock format.',
        suggestedTags: ['system', 'status']
      };
    }

    // 4. URL / Link Check
    if (this.URL_REGEX.test(trimmed)) {
      return {
        role: 'link',
        confidence: 0.97,
        explanation: 'Identified web link or hyperlinked address.',
        suggestedTags: ['navigation', 'web']
      };
    }

    // 5. Contact Name / Heading Check
    // Top 15% of canvas, 1 to 3 words, capitalized, short length
    const words = trimmed.split(/\s+/);
    const isCapitalized = words.every((w) => /^[A-Z][a-zA-Z0-9'.-]*$/.test(w));

    if (
      bounds.y < cH * 0.16 &&
      words.length >= 1 &&
      words.length <= 3 &&
      isCapitalized &&
      trimmed.length < 32
    ) {
      return {
        role: 'name',
        confidence: 0.93,
        explanation: 'Header position with capitalized contact/user name pattern.',
        suggestedTags: ['contact', 'title']
      };
    }

    // 6. Large Headline / Heading
    if (bounds.height > 28 || (words.length <= 6 && bounds.y < cH * 0.25)) {
      return {
        role: 'heading',
        confidence: 0.89,
        explanation: 'Prominent headline or section header.',
        suggestedTags: ['typography', 'heading']
      };
    }

    // 7. Message Bubble Content
    if (
      containerType === 'message' ||
      (bounds.width > cW * 0.3 && bounds.y > cH * 0.12 && bounds.y < cH * 0.88)
    ) {
      return {
        role: 'message',
        confidence: 0.92,
        explanation: 'Conversation message body in middle content flow.',
        suggestedTags: ['chat', 'message']
      };
    }

    // 8. Action Button Check
    if (
      words.length <= 3 &&
      bounds.width < 180 &&
      bounds.height < 50 &&
      /^(ok|submit|send|cancel|reply|forward|delete|save|edit|continue|view)$/i.test(trimmed)
    ) {
      return {
        role: 'button',
        confidence: 0.91,
        explanation: 'Interactive action button trigger.',
        suggestedTags: ['action', 'interactive']
      };
    }

    // Default Generic Text
    return {
      role: 'text',
      confidence: 0.78,
      explanation: 'General text element.',
      suggestedTags: ['content']
    };
  }
}
