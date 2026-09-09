/**
 * RECONSTRUCTA — DETECTION & CONFIDENCE REVIEW PANEL
 * Human-in-the-loop review interface for confidence scores, region split/merge,
 * type re-classification, accept/reject, and lock/unlock operations.
 */

import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { LuxuryButton } from '../common/LuxuryButton';
import { ConfidenceEngine } from '../../engine/vision/confidenceEngine';
import { AlertTriangle, CheckCircle, Split, Merge, PlusCircle, Trash2, Lock, Unlock, Layers } from 'lucide-react';
import { ElementType, SceneNode } from '../../types/sceneGraph';

const ALL_ELEMENT_TYPES: ElementType[] = [
  'text',
  'heading',
  'message',
  'button',
  'icon',
  'avatar',
  'image',
  'media',
  'shape',
  'table',
  'status-bar',
  'navigation-bar',
  'footer',
  'header',
  'timestamp',
  'reaction',
  'badge',
  'divider',
  'input',
  'link'
];

export const OcrPanel: React.FC = () => {
  const { sceneGraph, selectedNodeIds, updateNode, addNode, deleteNodes, setSelectedNodes } = useEditorStore();
  const { pushState } = useHistoryStore();

  const [filterTab, setFilterTab] = React.useState<'all' | 'needs_review' | 'verified'>('all');

  const reviewItems = ConfidenceEngine.evaluateSceneGraph(sceneGraph.nodes);
  const lowConfidenceCount = reviewItems.filter((i) => i.isLowConfidence).length;
  const verifiedCount = reviewItems.filter((i) => !i.isLowConfidence).length;

  const filteredItems = reviewItems.filter((item) => {
    if (filterTab === 'needs_review') return item.isLowConfidence;
    if (filterTab === 'verified') return !item.isLowConfidence;
    return true;
  });

  const selectedNodes = selectedNodeIds.map((id) => sceneGraph.nodes[id]).filter(Boolean);

  const handleMergeSelected = () => {
    if (selectedNodes.length < 2) return;
    pushState(sceneGraph);
    const merged = ConfidenceEngine.mergeRegions(selectedNodes);
    if (merged) {
      const firstId = selectedNodes[0].id;
      updateNode(firstId, merged);
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
    updateNode(nodeId, { confidence: 1.0, confidenceLabel: 'HIGH', reviewRequired: false, source: 'manual' });
  };

  const handleAcceptAllHighConfidence = () => {
    pushState(sceneGraph);
    for (const item of reviewItems) {
      if (item.confidence >= 0.8) {
        updateNode(item.nodeId, { reviewRequired: false, confidenceLabel: 'HIGH' });
      }
    }
  };

  const handleDemoteToBackground = (nodeId: string) => {
    pushState(sceneGraph);
    updateNode(nodeId, {
      type: 'background',
      zIndex: 1,
      locked: true,
      reconstructionStatus: 'flattened',
      limitations: ['Demoted to static background plane']
    });
  };

  const handleRejectNode = (nodeId: string) => {
    pushState(sceneGraph);
    deleteNodes([nodeId]);
  };

  const handleChangeType = (nodeId: string, newType: ElementType) => {
    pushState(sceneGraph);
    updateNode(nodeId, { type: newType, source: 'manual', reviewRequired: false });
  };

  const handleToggleLock = (nodeId: string, currentLocked: boolean) => {
    pushState(sceneGraph);
    updateNode(nodeId, { locked: !currentLocked });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
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
            DETECTION ACCURACY & REVIEW
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: lowConfidenceCount > 0 ? 'var(--status-warning)' : 'var(--status-success)'
            }}
          >
            {lowConfidenceCount > 0 ? `${lowConfidenceCount} Needs Review` : 'All Verified'}
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
              borderRadius: 4,
              marginBottom: 8
            }}
          >
            <AlertTriangle size={13} />
            <span>Low-confidence elements flagged below for verification.</span>
          </div>
        )}

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <button
            onClick={() => setFilterTab('all')}
            style={{
              flex: 1,
              fontSize: 10,
              padding: '4px 6px',
              borderRadius: 4,
              border: filterTab === 'all' ? '1px solid var(--gold-border-bright)' : '1px solid transparent',
              background: filterTab === 'all' ? 'var(--surface-elevated)' : 'transparent',
              color: filterTab === 'all' ? 'var(--gold-bright)' : 'var(--text-subtle)',
              cursor: 'pointer'
            }}
          >
            All ({reviewItems.length})
          </button>
          <button
            onClick={() => setFilterTab('needs_review')}
            style={{
              flex: 1,
              fontSize: 10,
              padding: '4px 6px',
              borderRadius: 4,
              border: filterTab === 'needs_review' ? '1px solid var(--status-warning)' : '1px solid transparent',
              background: filterTab === 'needs_review' ? 'rgba(230, 126, 34, 0.15)' : 'transparent',
              color: filterTab === 'needs_review' ? 'var(--status-warning)' : 'var(--text-subtle)',
              cursor: 'pointer'
            }}
          >
            Review ({lowConfidenceCount})
          </button>
          <button
            onClick={() => setFilterTab('verified')}
            style={{
              flex: 1,
              fontSize: 10,
              padding: '4px 6px',
              borderRadius: 4,
              border: filterTab === 'verified' ? '1px solid var(--status-success)' : '1px solid transparent',
              background: filterTab === 'verified' ? 'rgba(46, 204, 113, 0.15)' : 'transparent',
              color: filterTab === 'verified' ? 'var(--status-success)' : 'var(--text-subtle)',
              cursor: 'pointer'
            }}
          >
            Verified ({verifiedCount})
          </button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <LuxuryButton size="sm" onClick={handleAddManualBox} title="Add manual region">
          <PlusCircle size={13} /> Add
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

        {lowConfidenceCount > 0 && (
          <LuxuryButton
            size="sm"
            variant="default"
            onClick={handleAcceptAllHighConfidence}
            title="Accept all high-confidence detections in batch"
          >
            <CheckCircle size={13} /> Accept &gt;80%
          </LuxuryButton>
        )}
      </div>

      {/* Review List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredItems.map((item) => {
          const node = sceneGraph.nodes[item.nodeId];
          if (!node) return null;

          const isSelected = selectedNodeIds.includes(item.nodeId);
          const percent = Math.round(item.confidence * 100);
          const label = item.confidence >= 0.9 ? 'HIGH' : item.confidence >= 0.7 ? 'MEDIUM' : 'LOW';
          const badgeColor =
            label === 'HIGH'
              ? 'var(--status-success)'
              : label === 'MEDIUM'
              ? 'var(--gold-bright)'
              : 'var(--status-warning)';

          return (
            <div
              key={item.nodeId}
              onClick={() => setSelectedNodes([item.nodeId])}
              style={{
                background: isSelected ? 'var(--surface-elevated)' : 'var(--surface-dark)',
                border: isSelected
                  ? '1px solid var(--gold-border-bright)'
                  : item.isLowConfidence
                  ? '1px solid rgba(218, 165, 32, 0.5)'
                  : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '8px 10px',
                cursor: 'pointer',
                transition: 'all 120ms ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                {/* Element Type Selector */}
                <select
                  value={node.type}
                  onChange={(e) => handleChangeType(item.nodeId, e.target.value as ElementType)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: 'var(--surface-sunken)',
                    color: 'var(--gold-antique)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 3,
                    fontSize: 10.5,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    padding: '2px 4px',
                    cursor: 'pointer'
                  }}
                >
                  {ALL_ELEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Confidence Badge */}
                  <span
                    style={{
                      fontSize: 9.5,
                      fontFamily: 'var(--font-mono)',
                      color: badgeColor,
                      border: `1px solid ${badgeColor}`,
                      padding: '1px 4px',
                      borderRadius: 3
                    }}
                  >
                    {label} {percent}%
                  </span>

                  {/* Lock/Unlock */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleLock(item.nodeId, node.locked);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: node.locked ? 'var(--gold-bright)' : 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                    title={node.locked ? 'Unlock element' : 'Lock element'}
                  >
                    {node.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>

                  {/* Accept button */}
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
                      title="Accept & mark verified"
                    >
                      <CheckCircle size={13} />
                    </button>
                  )}
                  {/* Demote to Background button */}
                  {node.type !== 'background' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDemoteToBackground(item.nodeId);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-subtle)',
                        cursor: 'pointer'
                      }}
                      title="Demote to background plane"
                    >
                      <Layers size={12} />
                    </button>
                  )}

                  {/* Reject / Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRejectNode(item.nodeId);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--status-danger)',
                      cursor: 'pointer'
                    }}
                    title="Reject & delete element"
                  >
                    <Trash2 size={12} />
                  </button>
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
                {node.content || `[${node.type}]`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
