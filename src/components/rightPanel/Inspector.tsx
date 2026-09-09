/**
 * RECONSTRUCTA — CONTEXT-AWARE DYNAMIC INSPECTOR
 * Automatically adapts properties based on the selected element type.
 */

import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { IterativeFitter } from '../../engine/typography/iterativeFitter';
import { LuxuryButton } from '../common/LuxuryButton';
import {
  Sparkles,
  Sliders,
  Type,
  Maximize2,
  Layers
} from 'lucide-react';
import { LayoutMode } from '../../types/sceneGraph';

const FONT_OPTIONS = [
  'Inter, sans-serif',
  'Roboto, sans-serif',
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
  'Cinzel, serif',
  'Playfair Display, serif',
  'JetBrains Mono, monospace',
  'Arial, sans-serif'
];

export const Inspector: React.FC = () => {
  const { sceneGraph, selectedNodeIds, updateNode, isRightDrawerOpen } = useEditorStore();
  const { pushState } = useHistoryStore();

  const selectedNode = selectedNodeIds.length === 1 ? sceneGraph.nodes[selectedNodeIds[0]] : null;

  if (!selectedNode) {
    // Canvas / Global Viewport Properties when no element is selected
    return (
      <aside className={`right-panel ${isRightDrawerOpen ? 'drawer-open' : ''}`}>
        <div className="inspector-section">
          <div className="inspector-title">
            <span>CANVAS SPECIFICATION</span>
            <Maximize2 size={13} />
          </div>

          <div className="field-group">
            <span className="field-label">Canvas Dimensions</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>W</span>
                <input
                  type="number"
                  disabled
                  value={sceneGraph.canvasWidth}
                  className="input-luxury"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>H</span>
                <input
                  type="number"
                  disabled
                  value={sceneGraph.canvasHeight}
                  className="input-luxury"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">Background Base</span>
            <input
              type="color"
              value={sceneGraph.backgroundColor || '#08070A'}
              disabled
              className="input-luxury"
              style={{ width: '100%', height: 32, padding: 2, cursor: 'not-allowed' }}
            />
          </div>
        </div>

        <div className="inspector-section">
          <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 12 }}>
            Select an element to inspect and edit its typography, geometry, or layout constraints.
          </div>
        </div>
      </aside>
    );
  }

  // Handle Iterative Typography Auto-Fitting
  const handleAutoFitTypography = () => {
    if (!selectedNode.content) return;
    pushState(sceneGraph);

    const fitResult = IterativeFitter.fitTextToBounds(
      selectedNode.content,
      {
        x: selectedNode.x,
        y: selectedNode.y,
        width: selectedNode.width,
        height: selectedNode.height
      },
      selectedNode.fontFamily || 'Inter, sans-serif',
      selectedNode.fontWeight || 400
    );

    updateNode(selectedNode.id, {
      fontSize: fitResult.fontSize,
      letterSpacing: fitResult.letterSpacing,
      lineHeight: fitResult.lineHeight
    });
  };

  const isTextType =
    selectedNode.type === 'text' ||
    selectedNode.type === 'heading' ||
    selectedNode.type === 'name' ||
    selectedNode.type === 'message' ||
    selectedNode.type === 'timestamp' ||
    selectedNode.type === 'email' ||
    selectedNode.content !== undefined;

  return (
    <aside className={`right-panel ${isRightDrawerOpen ? 'drawer-open' : ''}`}>
      {/* 1. Element Header & Metadata */}
      <div className="inspector-section">
        <div className="inspector-title">
          <span>{selectedNode.type.toUpperCase()} ELEMENT</span>
          <span
            style={{
              fontSize: 9.5,
              padding: '2px 6px',
              borderRadius: 3,
              background: 'var(--surface-elevated)',
              color: 'var(--gold-antique)',
              fontFamily: 'var(--font-mono)'
            }}
          >
            {Math.round(selectedNode.confidence * 100)}% Match
          </span>
        </div>

        <div className="field-group">
          <span className="field-label">Layer Name</span>
          <input
            type="text"
            value={selectedNode.name}
            onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })}
            className="input-luxury"
          />
        </div>
      </div>

      {/* 2. Text & Typography Section (Only if element has text) */}
      {isTextType && (
        <div className="inspector-section">
          <div className="inspector-title">
            <span>TYPOGRAPHY</span>
            <Type size={13} />
          </div>

          <div className="field-group">
            <span className="field-label">Content</span>
            <textarea
              rows={3}
              value={selectedNode.content || ''}
              onChange={(e) => updateNode(selectedNode.id, { content: e.target.value }, true)}
              className="input-luxury"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="field-group">
            <span className="field-label">Font Family</span>
            <select
              value={selectedNode.fontFamily || 'Inter, sans-serif'}
              onChange={(e) => updateNode(selectedNode.id, { fontFamily: e.target.value })}
              className="input-luxury"
              style={{ width: '100%' }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f.split(',')[0].replace(/"/g, '')}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div className="field-group" style={{ marginBottom: 0 }}>
              <span className="field-label">Font Size</span>
              <input
                type="number"
                value={selectedNode.fontSize || 14}
                onChange={(e) => updateNode(selectedNode.id, { fontSize: Number(e.target.value) })}
                className="input-luxury"
              />
            </div>

            <div className="field-group" style={{ marginBottom: 0 }}>
              <span className="field-label">Weight</span>
              <select
                value={selectedNode.fontWeight || 400}
                onChange={(e) => updateNode(selectedNode.id, { fontWeight: Number(e.target.value) })}
                className="input-luxury"
              >
                <option value={300}>Light (300)</option>
                <option value={400}>Regular (400)</option>
                <option value={500}>Medium (500)</option>
                <option value={600}>Semi-Bold (600)</option>
                <option value={700}>Bold (700)</option>
              </select>
            </div>
          </div>

          <div className="field-group">
            <span className="field-label">Color</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="color"
                value={selectedNode.color || '#FFFFFF'}
                onChange={(e) => updateNode(selectedNode.id, { color: e.target.value })}
                style={{ width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer' }}
              />
              <input
                type="text"
                value={selectedNode.color || '#FFFFFF'}
                onChange={(e) => updateNode(selectedNode.id, { color: e.target.value })}
                className="input-luxury"
                style={{ flex: 1, textTransform: 'uppercase' }}
              />
            </div>
          </div>

          {/* Iterative Fitting Action */}
          <div style={{ marginTop: 8 }}>
            <LuxuryButton
              size="sm"
              variant="primary"
              onClick={handleAutoFitTypography}
              style={{ width: '100%' }}
              title="Automatically adjusts font size and letter spacing to fit target bounding box"
            >
              <Sparkles size={13} /> Iterative Fitting to Bounds
            </LuxuryButton>
          </div>
        </div>
      )}

      {/* 3. Geometry & Coordinates */}
      <div className="inspector-section">
        <div className="inspector-title">
          <span>GEOMETRY & POSITION</span>
          <Sliders size={13} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>X (px)</span>
            <input
              type="number"
              value={selectedNode.x}
              onChange={(e) => updateNode(selectedNode.id, { x: Number(e.target.value) })}
              className="input-luxury"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>Y (px)</span>
            <input
              type="number"
              value={selectedNode.y}
              onChange={(e) => updateNode(selectedNode.id, { y: Number(e.target.value) })}
              className="input-luxury"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>Width</span>
            <input
              type="number"
              value={selectedNode.width}
              onChange={(e) => updateNode(selectedNode.id, { width: Number(e.target.value) })}
              className="input-luxury"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>Height</span>
            <input
              type="number"
              value={selectedNode.height}
              onChange={(e) => updateNode(selectedNode.id, { height: Number(e.target.value) })}
              className="input-luxury"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* 4. Constraint & Reflow Layout */}
      <div className="inspector-section">
        <div className="inspector-title">
          <span>LAYOUT CONSTRAINTS</span>
          <Layers size={13} />
        </div>

        <div className="field-group">
          <span className="field-label">Layout Mode</span>
          <select
            value={selectedNode.constraints.mode}
            onChange={(e) =>
              updateNode(selectedNode.id, {
                constraints: { ...selectedNode.constraints, mode: e.target.value as LayoutMode }
              })
            }
            className="input-luxury"
            style={{ width: '100%' }}
          >
            <option value="fixed">Fixed Position</option>
            <option value="auto">Auto Layout (Self-expand)</option>
            <option value="reflow">Smart Reflow (Push siblings)</option>
          </select>
        </div>
      </div>
    </aside>
  );
};
