/**
 * RECONSTRUCTA — CHAT UI LAYOUT REFLOW ENGINE
 * Specialized layout reflow for messaging bubbles, wrapping, timestamps, and delivery indicators.
 */

import { SceneNode, SceneGraph } from '../../types/sceneGraph';

export class ChatReflow {
  /**
   * Reflows a message bubble and its contents when message text changes
   */
  static reflowMessageThread(
    messageTextNodeId: string,
    newText: string,
    sceneGraph: SceneGraph
  ): Record<string, Partial<SceneNode>> {
    const nodes = sceneGraph.nodes;
    const textNode = nodes[messageTextNodeId];
    if (!textNode) return {};

    const updates: Record<string, Partial<SceneNode>> = {};

    // 1. Calculate new text dimensions with wrapping
    const maxTextWidth = Math.min(sceneGraph.canvasWidth * 0.65, 360);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return {};

    const fontSize = textNode.fontSize || 14;
    const fontFamily = textNode.fontFamily || 'Inter, sans-serif';
    const fontWeight = textNode.fontWeight || 400;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

    // Word wrapping calculation
    const words = newText.split(' ');
    let currentLine = '';
    const lines: string[] = [];

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const longestLineWidth = Math.min(
      maxTextWidth,
      Math.max(...lines.map((l) => ctx.measureText(l).width), 60)
    );
    const lineHeightPx = fontSize * (textNode.lineHeight || 1.3);
    const calculatedTextHeight = Math.max(Math.round(lines.length * lineHeightPx), 20);
    const calculatedTextWidth = Math.round(longestLineWidth);

    const deltaHeight = calculatedTextHeight - textNode.height;

    updates[messageTextNodeId] = {
      content: newText,
      width: calculatedTextWidth,
      height: calculatedTextHeight
    };

    // 2. Expand parent bubble if it exists
    const bubbleNode = textNode.parentId ? nodes[textNode.parentId] : null;
    if (bubbleNode && bubbleNode.type === 'message') {
      const bubblePadX = 14;
      const bubblePadY = 10;
      const newBubbleW = calculatedTextWidth + bubblePadX * 2 + 35; // allowance for timestamp
      const newBubbleH = calculatedTextHeight + bubblePadY * 2;

      updates[bubbleNode.id] = {
        width: Math.max(newBubbleW, 90),
        height: Math.max(newBubbleH, 38)
      };

      // 3. Shift anchored timestamp and read receipts
      for (const childId of bubbleNode.childrenIds) {
        const child = nodes[childId];
        if (child && (child.type === 'timestamp' || child.type === 'icon')) {
          updates[child.id] = {
            x: Math.round(bubbleNode.x + newBubbleW - child.width - 8),
            y: Math.round(bubbleNode.y + newBubbleH - child.height - 4)
          };
        }
      }

      // 4. Shift subsequent messages below
      const bubbleBottom = bubbleNode.y + bubbleNode.height;
      for (const node of Object.values(nodes)) {
        if (node.id !== bubbleNode.id && node.id !== textNode.id && node.y > bubbleBottom) {
          updates[node.id] = {
            ...updates[node.id],
            y: Math.round(node.y + deltaHeight)
          };
        }
      }
    }

    return updates;
  }
}
