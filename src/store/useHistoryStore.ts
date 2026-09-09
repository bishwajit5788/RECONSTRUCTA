/**
 * RECONSTRUCTA — HISTORY STORE (NON-DESTRUCTIVE UNDO / REDO)
 * Maintains snapshot checkpoints of the scene graph with bounded memory consumption.
 */

import { create } from 'zustand';
import { SceneGraph } from '../types/sceneGraph';

const MAX_HISTORY_STEPS = 35;

export interface HistoryState {
  past: SceneGraph[];
  future: SceneGraph[];
  canUndo: boolean;
  canRedo: boolean;

  pushState: (currentState: SceneGraph) => void;
  undo: (currentState: SceneGraph) => SceneGraph | null;
  redo: (currentState: SceneGraph) => SceneGraph | null;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  pushState: (currentState) => {
    set((state) => {
      // Clone snapshot to prevent reference mutations
      const snapshot = JSON.parse(JSON.stringify(currentState));
      const newPast = [...state.past, snapshot].slice(-MAX_HISTORY_STEPS);
      return {
        past: newPast,
        future: [], // New action clears redo stack
        canUndo: newPast.length > 0,
        canRedo: false
      };
    });
  },

  undo: (currentState) => {
    const { past, future } = get();
    if (past.length === 0) return null;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const newFuture = [JSON.parse(JSON.stringify(currentState)), ...future];

    set({
      past: newPast,
      future: newFuture,
      canUndo: newPast.length > 0,
      canRedo: true
    });

    return previous;
  },

  redo: (currentState) => {
    const { past, future } = get();
    if (future.length === 0) return null;

    const next = future[0];
    const newFuture = future.slice(1);
    const newPast = [...past, JSON.parse(JSON.stringify(currentState))];

    set({
      past: newPast,
      future: newFuture,
      canUndo: true,
      canRedo: newFuture.length > 0
    });

    return next;
  },

  clearHistory: () => set({ past: [], future: [], canUndo: false, canRedo: false })
}));
