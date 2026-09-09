/**
 * RECONSTRUCTA — CONFIDENCE & HUMAN-IN-THE-LOOP ENGINE
 * Tracks detection uncertainty, highlights low-confidence regions for human review,
 * and provides region merge, split, accept, and reject operations.
 */

import { SceneNode, ElementType, BoundingBox } from '../../types/sceneGraph';

export const CONFIDENCE_THRESHOLD_LOW = 0.75;
export const CONFIDENCE_THRESHOLD_HIGH = 0.90;

export interface DetectionReviewItem {
  nodeId: string;
  type: ElementType;
  confidence: number;
  isLowConfidence: boolean;
  needsReview: boolean;
  originalText?: string;
  source: string;
}

export class ConfidenceEngine {
  /**
   * Evaluates all nodes in the scene graph and generates a review manifest
   */
  static evaluateSceneGraph(nodes: Record<string, SceneNode>): DetectionReviewItem[] {
    const manifest: DetectionReviewItem[] = [];

    for (const node of Object.values(nodes)) {
      const isLow = node.confidence < CONFIDENCE_THRESHOLD_LOW;
      manifest.push({
        nodeId: node.id,
        type: node.type,
        confidence: Math.round(node.confidence * 100) / 100,
        isLowConfidence: isLow,
        needsReview: isLow && node.source !== 'manual',
        originalText: node.content,
        source: node.source
      });
    }

    return manifest.sort((a, b) => a.confidence - b.confidence);
  }

  /**
   * Merges two or more adjacent text or visual regions into a single consolidated bounding box
   */
  static mergeRegions(nodesToMerge: SceneNode[]): Partial<SceneNode> | null {
    if (nodesToMerge.length < 2) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const combinedTexts: string[] = [];
    let avgConfidence = 0;

    for (const node of nodesToMerge) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);

      if (node.content) {
        combinedTexts.push(node.content);
      }
      avgConfidence += node.confidence;
    }

    avgConfidence /= nodesToMerge.length;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      content: combinedTexts.join(' '),
      confidence: Math.min(avgConfidence + 0.05, 1.0),
      source: 'manual'
    };
  }

  /**
   * Splits a multi-line or segmented node horizontally or vertically
   */
  static splitRegion(
    node: SceneNode,
    splitAxis: 'horizontal' | 'vertical' = 'horizontal'
  ): [Partial<SceneNode>, Partial<SceneNode>] {
    if (splitAxis === 'horizontal') {
      const halfHeight = Math.round(node.height / 2);
      const words = (node.content || '').split(' ');
      const midPoint = Math.ceil(words.length / 2);
      const text1 = words.slice(0, midPoint).join(' ');
      const text2 = words.slice(midPoint).join(' ');

      const part1: Partial<SceneNode> = {
        ...node,
        id: `${node.id}_split_1`,
        name: `${node.name} (Part 1)`,
        y: node.y,
        height: halfHeight,
        content: text1,
        source: 'manual'
      };

      const part2: Partial<SceneNode> = {
        ...node,
        id: `${node.id}_split_2`,
        name: `${node.name} (Part 2)`,
        y: node.y + halfHeight,
        height: node.height - halfHeight,
        content: text2,
        source: 'manual'
      };

      return [part1, part2];
    } else {
      const halfWidth = Math.round(node.width / 2);
      const part1: Partial<SceneNode> = {
        ...node,
        id: `${node.id}_split_1`,
        name: `${node.name} (Left)`,
        x: node.x,
        width: halfWidth,
        source: 'manual'
      };

      const part2: Partial<SceneNode> = {
        ...node,
        id: `${node.id}_split_2`,
        name: `${node.name} (Right)`,
        x: node.x + halfWidth,
        width: node.width - halfWidth,
        source: 'manual'
      };

      return [part1, part2];
    }
  }

  /**
   * Creates a manual user-drawn bounding region
   */
  static createManualRegion(
    bounds: BoundingBox,
    type: ElementType = 'text',
    defaultContent: string = 'Editable Text'
  ): SceneNode {
    return {
      id: `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: `Manual ${type}`,
      type,
      parentId: null,
      childrenIds: [],
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(Math.round(bounds.width), 20),
      height: Math.max(Math.round(bounds.height), 16),
      rotation: 0,
      opacity: 1,
      zIndex: 10,
      visible: true,
      locked: false,
      content: defaultContent,
      fontFamily: 'Inter, sans-serif',
      fontSize: 14,
      fontWeight: 400,
      color: '#FFFFFF',
      lineHeight: 1.25,
      letterSpacing: 0,
      alignment: 'left',
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      source: 'manual'
    };
  }
}
