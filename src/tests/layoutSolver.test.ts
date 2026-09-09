/**
 * RECONSTRUCTA — CONSTRAINT SOLVER & CHAT REFLOW TEST SUITE
 */

import { describe, it, expect } from 'vitest';
import { ConstraintSolver } from '../engine/layout/constraintSolver';
import { SceneGraph, SceneNode } from '../types/sceneGraph';

describe('Layout Constraint Solver', () => {
  it('expands parent bubble container when child text expands in reflow mode', () => {
    const parentBubble: SceneNode = {
      id: 'bubble_1',
      name: 'Bubble',
      type: 'message',
      parentId: null,
      childrenIds: ['text_1'],
      x: 50,
      y: 100,
      width: 200,
      height: 60,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: false,
      constraints: { mode: 'auto', padding: { top: 10, right: 15, bottom: 10, left: 15 } },
      confidence: 1,
      source: 'manual'
    };

    const childText: SceneNode = {
      id: 'text_1',
      name: 'Text',
      type: 'text',
      parentId: 'bubble_1',
      childrenIds: [],
      x: 65,
      y: 110,
      width: 170,
      height: 40,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      visible: true,
      locked: false,
      content: 'Short',
      constraints: { mode: 'fixed' },
      confidence: 1,
      source: 'manual'
    };

    const graph: SceneGraph = {
      nodes: { bubble_1: parentBubble, text_1: childText },
      rootIds: ['bubble_1'],
      canvasWidth: 800,
      canvasHeight: 1200,
      backgroundColor: '#08070A'
    };

    // Text expands to width 300, height 80
    const result = ConstraintSolver.solveReflow('text_1', 300, 80, graph);

    expect(result.updatedNodes['text_1']).toEqual({ width: 300, height: 80 });
    expect(result.updatedNodes['bubble_1']).toBeDefined();
    expect(result.updatedNodes['bubble_1'].width).toBe(300 + 15 + 15); // width + padding
    expect(result.updatedNodes['bubble_1'].height).toBe(80 + 10 + 10);  // height + padding
  });

  it('shifts subsequent sibling nodes down when a preceding message grows', () => {
    const msg1: SceneNode = {
      id: 'msg_1',
      name: 'Message 1',
      type: 'message',
      parentId: null,
      childrenIds: [],
      x: 50,
      y: 100,
      width: 200,
      height: 50,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: false,
      constraints: { mode: 'reflow' },
      confidence: 1,
      source: 'manual'
    };

    const msg2: SceneNode = {
      id: 'msg_2',
      name: 'Message 2',
      type: 'message',
      parentId: null,
      childrenIds: [],
      x: 50,
      y: 170,
      width: 200,
      height: 50,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: false,
      constraints: { mode: 'reflow' },
      confidence: 1,
      source: 'manual'
    };

    const graph: SceneGraph = {
      nodes: { msg_1: msg1, msg_2: msg2 },
      rootIds: ['msg_1', 'msg_2'],
      canvasWidth: 800,
      canvasHeight: 1200,
      backgroundColor: '#08070A'
    };

    // msg_1 height increases from 50 to 90 (delta +40)
    const result = ConstraintSolver.solveReflow('msg_1', 200, 90, graph);

    expect(result.updatedNodes['msg_2']).toBeDefined();
    expect(result.updatedNodes['msg_2'].y).toBe(170 + 40); // 210
  });
});
