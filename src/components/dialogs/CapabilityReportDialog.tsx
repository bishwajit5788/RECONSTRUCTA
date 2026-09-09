/**
 * RECONSTRUCTA — RECONSTRUCTION FIDELITY & AUDIT REPORT DIALOG
 * Displays genuine visual fidelity scorecard, element status distribution,
 * confidence breakdown, limitation notices, and audit export.
 */

import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { LuxuryButton } from '../common/LuxuryButton';
import {
  X,
  FileCheck2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Layers
} from 'lucide-react';

interface CapabilityReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CapabilityReportDialog: React.FC<CapabilityReportDialogProps> = ({
  isOpen,
  onClose
}) => {
  const { sceneGraph, project } = useEditorStore();

  if (!isOpen) return null;

  const nodes = Object.values(sceneGraph.nodes);
  const totalCount = nodes.length;

  // 1. Status breakdown
  const nativeCount = nodes.filter((n) => n.reconstructionStatus === 'native').length;
  const reconstructedCount = nodes.filter(
    (n) => !n.reconstructionStatus || n.reconstructionStatus === 'reconstructed'
  ).length;
  const approximatedCount = nodes.filter((n) => n.reconstructionStatus === 'approximated').length;
  const flattenedCount = nodes.filter((n) => n.reconstructionStatus === 'flattened').length;

  // 2. Confidence breakdown
  const highConfCount = nodes.filter((n) => n.confidence >= 0.85).length;
  const medConfCount = nodes.filter((n) => n.confidence >= 0.7 && n.confidence < 0.85).length;
  const lowConfCount = nodes.filter((n) => n.confidence < 0.7).length;

  const avgConfidence =
    totalCount > 0
      ? Math.round((nodes.reduce((acc, n) => acc + (n.confidence || 0), 0) / totalCount) * 100)
      : 100;

  // 3. Aggregate limitations across all nodes
  const allLimitations = Array.from(
    new Set(nodes.flatMap((n) => n.limitations || []))
  );

  const handleExportAuditReport = () => {
    const reportData = {
      project: {
        canvasWidth: sceneGraph.canvasWidth,
        canvasHeight: sceneGraph.canvasHeight,
        platformHint: project?.platform || 'generic',
        totalElements: totalCount,
        averageConfidence: `${avgConfidence}%`
      },
      fidelityScorecard: {
        nativeVectorElements: nativeCount,
        reconstructedElements: reconstructedCount,
        approximatedElements: approximatedCount,
        flattenedElements: flattenedCount
      },
      confidenceDistribution: {
        highConfidence: highConfCount,
        mediumConfidence: medConfCount,
        lowConfidence: lowConfCount
      },
      detectedLimitations: allLimitations,
      nodesAudit: nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        source: n.source,
        confidenceSource: n.confidenceSource,
        reconstructionStatus: n.reconstructionStatus,
        confidence: n.confidence,
        detectionMethod: n.detectionMethod,
        evidence: n.evidence,
        limitations: n.limitations
      }))
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconstructa_fidelity_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(8, 7, 10, 0.78)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '90vh',
          background: 'var(--surface-dark)',
          border: '1px solid var(--gold-border-bright)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-elevated)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(212, 175, 55, 0.15)',
                color: 'var(--gold-bright)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <FileCheck2 size={18} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-ivory)', letterSpacing: '0.04em' }}>
                RECONSTRUCTA ANALYSIS REPORT
              </div>
              <div style={{ fontSize: 11, color: 'var(--gold-antique)', marginTop: 2 }}>
                Genuine Fidelity Audit & Source Traceability
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Top Score Banner */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              background: 'var(--surface-sunken)',
              padding: 12,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold-bright)', fontFamily: 'var(--font-mono)' }}>
                {avgConfidence}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', marginTop: 2 }}>
                Avg Confidence
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--status-success)', fontFamily: 'var(--font-mono)' }}>
                {nativeCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', marginTop: 2 }}>
                Native Stream
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold-light)', fontFamily: 'var(--font-mono)' }}>
                {reconstructedCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', marginTop: 2 }}>
                Reconstructed
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--status-warning)', fontFamily: 'var(--font-mono)' }}>
                {lowConfCount}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', marginTop: 2 }}>
                Needs Review
              </div>
            </div>
          </div>

          {/* Section: Fidelity Breakdown */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold-light)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={14} />
              <span>LAYER RECONSTRUCTION FIDELITY</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--status-success)' }}>Native Vector / Raw Binary Layers</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-ivory)' }}>{nativeCount} ({totalCount > 0 ? Math.round((nativeCount / totalCount) * 100) : 0}%)</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalCount > 0 ? (nativeCount / totalCount) * 100 : 0}%`, background: 'var(--status-success)' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                <span style={{ color: 'var(--gold-bright)' }}>Fully Reconstructed Semantic Layers</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-ivory)' }}>{reconstructedCount} ({totalCount > 0 ? Math.round((reconstructedCount / totalCount) * 100) : 0}%)</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalCount > 0 ? (reconstructedCount / totalCount) * 100 : 0}%`, background: 'var(--gold-bright)' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                <span style={{ color: 'var(--status-warning)' }}>Approximated / Estimated Layers</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-ivory)' }}>{approximatedCount} ({totalCount > 0 ? Math.round((approximatedCount / totalCount) * 100) : 0}%)</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalCount > 0 ? (approximatedCount / totalCount) * 100 : 0}%`, background: 'var(--status-warning)' }} />
              </div>

              {flattenedCount > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                    <span style={{ color: '#C39BD3' }}>Flattened Background Layer(s)</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-ivory)' }}>{flattenedCount}</span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(flattenedCount / totalCount) * 100}%`, background: '#C39BD3' }} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section: Known Fidelity Limitations */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold-light)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} style={{ color: 'var(--status-warning)' }} />
              <span>LIMITATIONS & HONEST NOTICES</span>
            </div>

            {allLimitations.length > 0 ? (
              <div
                style={{
                  background: 'rgba(230, 126, 34, 0.08)',
                  border: '1px solid rgba(230, 126, 34, 0.25)',
                  borderRadius: 'var(--radius-xs)',
                  padding: 12
                }}
              >
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--text-ivory)', lineHeight: 1.5 }}>
                  {allLimitations.map((lim, idx) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div
                style={{
                  background: 'rgba(46, 204, 113, 0.08)',
                  border: '1px solid rgba(46, 204, 113, 0.25)',
                  borderRadius: 'var(--radius-xs)',
                  padding: 10,
                  fontSize: 11,
                  color: 'var(--status-success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <CheckCircle2 size={13} />
                <span>No severe fidelity degradation or unhandled formatting detected in this document.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-elevated)'
          }}
        >
          <LuxuryButton size="sm" variant="default" onClick={handleExportAuditReport}>
            <Download size={13} /> Export Audit JSON
          </LuxuryButton>

          <LuxuryButton size="sm" variant="primary" onClick={onClose}>
            Close Report
          </LuxuryButton>
        </div>
      </div>
    </div>
  );
};
