/**
 * RECONSTRUCTA — OCR & DETECTION REVIEW PANEL
 * Human-in-the-loop review interface for confidence scores, region split/merge, and re-classification.
 */

import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { LuxuryButton } from '../common/LuxuryButton';
import { ConfidenceEngine, CONFIDENCE_THRESHOLD_LOW } from '../../engine/vision/confidenceEngine';
import { AlertTriangle, CheckCircle, Split, Merge, PlusCircle, RefreshCw } from 'lucide-react';
import { ElementType, SceneNode } from '../../types/sceneGraph';

export const OcrPanel: React.FC = () => {
  const { sceneGraph, selectedNodeIds, updateNode, addNode, deleteNodes, setSelectedNodes } = useEditorStore();
  const { pushState } = useHistoryStore();

  const reviewItems = ConfidenceEngine.evaluateSceneGraph(sceneGraph.nodes);
  const lowConfidenceCount = reviewItems.filter((i) => i.isLowConfidence).length;

  const selectedNodes = selectedNodeIds.map((id) => sceneGraph.nodes[id]).filter(Boolean);

  const handleMergeSelected = () => {
    if (selectedNodes.length < 2) return;
    pushState(sceneGraph);
    const merged = ConfidenceEngine.mergeRegions(selectedNodes);
    if (merged) {
      const firstId = selectedNodes[0].id;
      updateNode(firstId, merged);
      // Delete other merged nodes
      const idsToDelete = selectedNodes.slice(1).map((n) => n.id);
      deleteNodes(idsToDelete);
      setSelectedNodes([firstId]);
    }
  };

  const handleSplitSelected = () => {
    if (selectedNodes.length !== 1) return;
    pushState(sceneGraph);
    const [part1, part2] = ConfidenceEngine.splitRegion(selectedNodes[0], 'horizontal');
    updateNode(selectedNodes[0].id, part1);
    if (part2.id) {
      addNode(part2 as SceneNode);
    }
  };

  const handleAddManualBox = () => {
    pushState(sceneGraph);
    const manualNode = ConfidenceEngine.createManualRegion(
      { x: 100, y: 200, width: 200, height: 32 },
      'text',
      'New Editable Text'
    );
    addNode(manualNode);
  };

  const handleAcceptConfidence = (nodeId: string) => {
    pushState(sceneGraph);
    updateNode(nodeId, { confidence: 1.0, source: 'manual' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 14 }}>
      {/* Confidence Header Overview */}
      <div
        style={{
          background: 'var(--surface-dark)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold-light)' }}>
            DETECTION ACCURACY
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: lowConfidenceCount > 0 ? 'var(--status-warning)' : 'var(--status-success)'
            }}
          >
            {lowConfidenceCount > 0 ? `${lowConfidenceCount} Need Review` : '100% Calibrated'}
          </span>
        </div>

        {lowConfidenceCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--status-warning)',
              background: 'rgba(218, 165, 32, 0.1)',
              padding: '6px 8px',
              borderRadius: 4
            }}
          >
            <AlertTriangle size={13} />
            <span>Low-confidence detections detected. Please review below.</span>
          </div>
        )}
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', gap: 6 }}>
        <LuxuryButton size="sm" onClick={handleAddManualBox} title="Add manual text region">
          <PlusCircle size={13} /> Add Region
        </LuxuryButton>

        <LuxuryButton
          size="sm"
          disabled={selectedNodes.length < 2}
          onClick={handleMergeSelected}
          title="Merge selected regions"
        >
          <Merge size={13} /> Merge
        </LuxuryButton>

        <LuxuryButton
          size="sm"
          disabled={selectedNodes.length !== 1}
          onClick={handleSplitSelected}
          title="Split region horizontally"
        >
          <Split size={13} /> Split
        </LuxuryButton>
      </div>

      {/* Review List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {reviewItems.map((item) => {
          const isSelected = selectedNodeIds.includes(item.nodeId);
          const percent = Math.round(item.confidence * 100);

          return (
            <div
              key={item.nodeId}
              onClick={() => setSelectedNodes([item.nodeId])}
              style={{
                background: isSelected ? 'var(--surface-elevated)' : 'var(--surface-dark)',
                border: isSelected
                  ? '1px solid var(--gold-border-bright)'
                  : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '8px 10px',
                cursor: 'pointer',
                transition: 'all 120ms ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: 10.5,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--gold-antique)',
                    fontWeight: 600
                  }}
                >
                  {item.type}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      color: item.isLowConfidence ? 'var(--status-warning)' : 'var(--status-success)'
                    }}
                  >
                    {percent}%
                  </span>

                  {item.isLowConfidence && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAcceptConfidence(item.nodeId);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--status-success)',
                        cursor: 'pointer'
                      }}
                      title="Confirm detection"
                    >
                      <CheckCircle size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-ivory)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {item.originalText || '(Visual Element)'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
