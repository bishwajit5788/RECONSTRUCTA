/**
 * RECONSTRUCTA — SCENE GRAPH TEST SUITE
 */

import { describe, it, expect } from 'vitest';
import { SceneNode } from '../types/sceneGraph';
import { useEditorStore } from '../store/useEditorStore';

describe('Scene Graph & Layer Store', () => {
  it('initializes with empty nodes and default canvas resolution', () => {
    const store = useEditorStore.getState();
    expect(store.sceneGraph).toBeDefined();
    expect(store.sceneGraph.canvasWidth).toBe(1080);
    expect(store.sceneGraph.canvasHeight).toBe(1920);
  });

  it('correctly adds a new node to the scene graph', () => {
    const testNode: SceneNode = {
      id: 'test_node_1',
      name: 'Heading Test',
      type: 'heading',
      parentId: null,
      childrenIds: [],
      x: 50,
      y: 100,
      width: 300,
      height: 40,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: false,
      content: 'Welcome to Reconstructa',
      fontSize: 24,
      fontFamily: 'Cinzel, serif',
      constraints: { mode: 'fixed' },
      confidence: 0.95,
      source: 'manual'
    };

    useEditorStore.getState().addNode(testNode);
    const updated = useEditorStore.getState().sceneGraph;
    expect(updated.nodes['test_node_1']).toBeDefined();
    expect(updated.nodes['test_node_1'].content).toBe('Welcome to Reconstructa');
    expect(updated.rootIds).toContain('test_node_1');
  });

  it('updates node properties correctly', () => {
    useEditorStore.getState().updateNode('test_node_1', { fontSize: 32, color: '#D4AF37' });
    const node = useEditorStore.getState().sceneGraph.nodes['test_node_1'];
    expect(node.fontSize).toBe(32);
    expect(node.color).toBe('#D4AF37');
  });

  it('deletes nodes cleanly from both dictionary and rootIds', () => {
    useEditorStore.getState().deleteNodes(['test_node_1']);
    const updated = useEditorStore.getState().sceneGraph;
    expect(updated.nodes['test_node_1']).toBeUndefined();
    expect(updated.rootIds).not.toContain('test_node_1');
  });
});
