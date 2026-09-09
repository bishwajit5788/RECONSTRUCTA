/**
 * RECONSTRUCTA — CENTRAL ZUSTAND STORE
 * Manages active scene graph, selections, tool modes, viewport (zoom/pan), and processing state.
 */

import { create } from 'zustand';
import { SceneGraph, SceneNode } from '../types/sceneGraph';
import { ReconstructaProject } from '../types/project';
import { ConstraintSolver } from '../engine/layout/constraintSolver';

export type ToolType = 'select' | 'text' | 'shape' | 'crop' | 'inpaint' | 'pan';
export type ViewMode = 'edit' | 'split' | 'side-by-side' | 'hold-peek';

export interface EditorState {
  // Active Project & Scene Graph
  project: ReconstructaProject | null;
  sceneGraph: SceneGraph;
  selectedNodeIds: string[];
  activeTool: ToolType;
  viewMode: ViewMode;
  splitPosition: number; // 0.0 - 1.0 for Before/After split slider

  // Viewport
  zoom: number; // 0.1 to 8.0 (10% to 800%)
  panX: number;
  panY: number;
  showRulers: boolean;
  showGrid: boolean;
  gridSize: number;
  snapToGuides: boolean;

  // Processing & Connectivity
  isAnalyzing: boolean;
  analysisProgress: number; // 0.0 - 1.0
  statusMessage: string;
  isBackendConnected: boolean;
  isLocalOnlyMode: boolean;

  // Responsive Drawer Panels
  isLeftDrawerOpen: boolean;
  isRightDrawerOpen: boolean;

  // Actions
  setProject: (project: ReconstructaProject) => void;
  setSceneGraph: (sceneGraph: SceneGraph) => void;
  updateNode: (id: string, updates: Partial<SceneNode>, triggerReflow?: boolean) => void;
  addNode: (node: SceneNode) => void;
  deleteNodes: (ids: string[]) => void;
  setSelectedNodes: (ids: string[]) => void;
  setActiveTool: (tool: ToolType) => void;
  setViewMode: (mode: ViewMode) => void;
  setSplitPosition: (pos: number) => void;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  toggleRulers: () => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setProcessing: (isAnalyzing: boolean, progress: number, message: string) => void;
  setBackendConnected: (connected: boolean) => void;
  setLocalOnlyMode: (localOnly: boolean) => void;
  toggleLeftDrawer: () => void;
  toggleRightDrawer: () => void;
  reorderLayer: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => void;
}

const initialSceneGraph: SceneGraph = {
  nodes: {},
  rootIds: [],
  canvasWidth: 1080,
  canvasHeight: 1920,
  backgroundColor: '#08070A'
};

export const useEditorStore = create<EditorState>((set) => ({
  project: null,
  sceneGraph: initialSceneGraph,
  selectedNodeIds: [],
  activeTool: 'select',
  viewMode: 'edit',
  splitPosition: 0.5,

  zoom: 1.0,
  panX: 0,
  panY: 0,
  showRulers: true,
  showGrid: false,
  gridSize: 16,
  snapToGuides: true,

  isAnalyzing: false,
  analysisProgress: 0,
  statusMessage: 'Ready',
  isBackendConnected: false,
  isLocalOnlyMode: false,

  isLeftDrawerOpen: false,
  isRightDrawerOpen: false,

  setProject: (project) => set({ project, sceneGraph: project.sceneGraph }),
  setSceneGraph: (sceneGraph) => set({ sceneGraph }),

  updateNode: (id, updates, triggerReflow = true) => {
    set((state) => {
      const node = state.sceneGraph.nodes[id];
      if (!node) return state;

      const updatedNode = { ...node, ...updates };
      const newNodes = { ...state.sceneGraph.nodes, [id]: updatedNode };
      let newSceneGraph = { ...state.sceneGraph, nodes: newNodes };

      if (triggerReflow && (updates.content || updates.width || updates.height)) {
        const reflowRes = ConstraintSolver.solveReflow(
          id,
          updates.width ?? node.width,
          updates.height ?? node.height,
          newSceneGraph
        );

        for (const [mId, mUpdates] of Object.entries(reflowRes.updatedNodes)) {
          if (newSceneGraph.nodes[mId]) {
            newSceneGraph.nodes[mId] = { ...newSceneGraph.nodes[mId], ...mUpdates };
          }
        }
      }

      return { sceneGraph: newSceneGraph };
    });
  },

  addNode: (node) => {
    set((state) => {
      const newNodes = { ...state.sceneGraph.nodes, [node.id]: node };
      const newRootIds = [...state.sceneGraph.rootIds, node.id];
      return {
        sceneGraph: { ...state.sceneGraph, nodes: newNodes, rootIds: newRootIds },
        selectedNodeIds: [node.id]
      };
    });
  },

  deleteNodes: (ids) => {
    set((state) => {
      const newNodes = { ...state.sceneGraph.nodes };
      for (const id of ids) {
        delete newNodes[id];
      }
      const newRootIds = state.sceneGraph.rootIds.filter((id) => !ids.includes(id));
      return {
        sceneGraph: { ...state.sceneGraph, nodes: newNodes, rootIds: newRootIds },
        selectedNodeIds: []
      };
    });
  },

  setSelectedNodes: (ids) => set({ selectedNodeIds: ids }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSplitPosition: (splitPosition) => set({ splitPosition: Math.max(0.05, Math.min(0.95, splitPosition)) }),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(8.0, Math.round(zoom * 100) / 100)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set((s) => ({ snapToGuides: !s.snapToGuides })),

  setProcessing: (isAnalyzing, analysisProgress, statusMessage) =>
    set({ isAnalyzing, analysisProgress, statusMessage }),
  setBackendConnected: (isBackendConnected) => set({ isBackendConnected }),
  setLocalOnlyMode: (isLocalOnlyMode) => set({ isLocalOnlyMode }),
  toggleLeftDrawer: () => set((s) => ({ isLeftDrawerOpen: !s.isLeftDrawerOpen })),
  toggleRightDrawer: () => set((s) => ({ isRightDrawerOpen: !s.isRightDrawerOpen })),

  reorderLayer: (id, direction) => {
    set((state) => {
      const nodes = { ...state.sceneGraph.nodes };
      const node = nodes[id];
      if (!node) return state;

      const sorted = Object.values(nodes).sort((a, b) => a.zIndex - b.zIndex);
      const currentIndex = sorted.findIndex((n) => n.id === id);
      if (currentIndex === -1) return state;

      let targetIndex = currentIndex;
      if (direction === 'up' && currentIndex < sorted.length - 1) targetIndex = currentIndex + 1;
      else if (direction === 'down' && currentIndex > 0) targetIndex = currentIndex - 1;
      else if (direction === 'top') targetIndex = sorted.length - 1;
      else if (direction === 'bottom') targetIndex = 0;

      if (targetIndex !== currentIndex) {
        const tempZ = sorted[targetIndex].zIndex;
        sorted[targetIndex].zIndex = node.zIndex;
        node.zIndex = tempZ;
      }

      return { sceneGraph: { ...state.sceneGraph, nodes } };
    });
  }
}));
