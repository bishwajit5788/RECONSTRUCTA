/**
 * RECONSTRUCTA — CONSTRAINT-BASED LAYOUT ENGINE
 * Resolves layout dependencies, reflows sibling elements, prevents overlaps,
 * and maintains spacing across FIXED, AUTO, and REFLOW modes.
 */

import { SceneNode, SceneGraph } from '../../types/sceneGraph';

export interface LayoutReflowResult {
  updatedNodes: Record<string, Partial<SceneNode>>;
  movedNodeIds: string[];
}

export class ConstraintSolver {
  /**
   * Reflows dependent and subsequent nodes when a source node's dimensions change
   */
  static solveReflow(
    sourceNodeId: string,
    newWidth: number,
    newHeight: number,
    sceneGraph: SceneGraph
  ): LayoutReflowResult {
    const nodes = sceneGraph.nodes;
    const sourceNode = nodes[sourceNodeId];
    if (!sourceNode) {
      return { updatedNodes: {}, movedNodeIds: [] };
    }

    const updatedNodes: Record<string, Partial<SceneNode>> = {};
    const movedNodeIds: string[] = [];

    const deltaW = newWidth - sourceNode.width;
    const deltaH = newHeight - sourceNode.height;

    // Apply change to the source node itself
    updatedNodes[sourceNodeId] = {
      width: newWidth,
      height: newHeight
    };

    // If no size change, return early
    if (Math.abs(deltaW) < 0.5 && Math.abs(deltaH) < 0.5) {
      return { updatedNodes, movedNodeIds };
    }

    // 1. Resolve Parent Containers (e.g. chat bubble containing this text)
    if (sourceNode.parentId && nodes[sourceNode.parentId]) {
      const parent = nodes[sourceNode.parentId];
      if (parent.constraints.mode === 'auto' || parent.constraints.mode === 'reflow') {
        const padding = parent.constraints.padding || { top: 8, right: 12, bottom: 8, left: 12 };
        const newParentW = Math.max(newWidth + padding.left + padding.right, parent.constraints.minWidth || 60);
        const newParentH = Math.max(newHeight + padding.top + padding.bottom, parent.constraints.minHeight || 36);

        updatedNodes[parent.id] = {
          width: newParentW,
          height: newParentH
        };
        movedNodeIds.push(parent.id);
      }
    }

    // 2. Resolve Dependent Siblings (e.g. timestamp anchored inside bubble)
    for (const node of Object.values(nodes)) {
      if (node.constraints.dependsOn?.includes(sourceNodeId)) {
        if (node.constraints.anchor === 'bottom-right') {
          updatedNodes[node.id] = {
            x: Math.round(sourceNode.x + newWidth - node.width),
            y: Math.round(sourceNode.y + newHeight - node.height)
          };
          movedNodeIds.push(node.id);
        } else if (node.constraints.anchor === 'top-right') {
          updatedNodes[node.id] = {
            x: Math.round(sourceNode.x + newWidth - node.width)
          };
          movedNodeIds.push(node.id);
        }
      }
    }

    // 3. Shift following elements vertically if in reflow mode
    const sourceBottom = sourceNode.y + sourceNode.height;

    for (const node of Object.values(nodes)) {
      if (node.id === sourceNodeId || updatedNodes[node.id]?.y !== undefined) {
        continue;
      }

      // If the node is positioned below the source and reflow is active
      if (node.y >= sourceBottom - 5 && node.constraints.mode === 'reflow') {
        updatedNodes[node.id] = {
          ...updatedNodes[node.id],
          y: Math.round(node.y + deltaH)
        };
        movedNodeIds.push(node.id);
      }
    }

    return { updatedNodes, movedNodeIds };
  }
}
