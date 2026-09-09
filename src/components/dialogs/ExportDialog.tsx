/**
 * RECONSTRUCTA — EXPORT MODAL DIALOG
 * Configures format (PNG/JPEG/WebP/PDF), resolution scale, quality,
 * and provenance indicator ("EDITED / MOCKUP") watermark.
 */

import React, { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { ImageExporter } from '../../engine/export/imageExporter';
import { PDFParser } from '../../parsers/pdfParser';
import { LuxuryButton } from '../common/LuxuryButton';
import { Download, X, ShieldCheck, Check } from 'lucide-react';
import { ExportConfig } from '../../types/project';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  baseCanvas: HTMLCanvasElement | null;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose, baseCanvas }) => {
  const { sceneGraph } = useEditorStore();

  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp' | 'pdf'>('png');
  const [scale, setScale] = useState<number>(2);
  const [quality, setQuality] = useState<number>(0.95);
  const [includeWatermark, setIncludeWatermark] = useState<boolean>(true);
  const [watermarkText, setWatermarkText] = useState<string>('EDITED / MOCKUP');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleExecuteExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);

    try {
      if (format === 'pdf') {
        const dummyCanvas = baseCanvas || document.createElement('canvas');
        const pdfBlob = await PDFParser.exportToPDF([
          { canvas: dummyCanvas, textNodes: Object.values(sceneGraph.nodes) }
        ]);
        downloadBlob(pdfBlob, `reconstructa_export_${Date.now()}.pdf`);
      } else {
        const config: ExportConfig = {
          format,
          scale,
          quality,
          includeWatermark,
          watermarkText
        };
        const blob = await ImageExporter.exportToBlob(sceneGraph, baseCanvas, config);
        downloadBlob(blob, `reconstructa_export_${Date.now()}.${format}`);
      }

      setExportSuccess(true);
      setTimeout(() => {
        setIsExporting(false);
        onClose();
      }, 900);
    } catch (err: any) {
      alert(`Export failed: ${err?.message || 'Unknown error'}`);
      setIsExporting(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(8, 7, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 440,
          background: 'var(--surface-base)',
          border: '1px solid var(--border-gold-subtle)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-dark)'
          }}
        >
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 14, letterSpacing: '0.08em', color: 'var(--gold-light)' }}>
            EXPORT SPECIFICATION
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Format */}
          <div className="field-group">
            <span className="field-label">File Format</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {(['png', 'jpeg', 'webp', 'pdf'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`btn-luxury ${format === fmt ? 'btn-luxury-primary' : ''}`}
                  style={{ textTransform: 'uppercase', padding: '6px 4px', fontSize: 11.5 }}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Scale Resolution */}
          {format !== 'pdf' && (
            <div className="field-group">
              <span className="field-label">Export Scale</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[1, 2, 3].map((s) => (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    className={`btn-luxury ${scale === s ? 'btn-luxury-primary' : ''}`}
                    style={{ padding: '6px 4px', fontSize: 11.5 }}
                  >
                    {s}x ({Math.round(sceneGraph.canvasWidth * s)} × {Math.round(sceneGraph.canvasHeight * s)})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Provenance Watermark Toggle (Safety requirement) */}
          <div
            style={{
              background: 'var(--surface-dark)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={16} style={{ color: 'var(--gold-antique)' }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-ivory)' }}>
                  Provenance Indicator
                </span>
              </div>
              <input
                type="checkbox"
                checked={includeWatermark}
                onChange={(e) => setIncludeWatermark(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--gold-antique)' }}
              />
            </div>

            {includeWatermark && (
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                className="input-luxury"
                placeholder="Watermark text"
                style={{ fontSize: 11.5 }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--surface-dark)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10
          }}
        >
          <LuxuryButton variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </LuxuryButton>

          <LuxuryButton
            variant="primary"
            size="sm"
            onClick={handleExecuteExport}
            disabled={isExporting}
          >
            {exportSuccess ? (
              <>
                <Check size={14} /> Complete
              </>
            ) : isExporting ? (
              'Exporting...'
            ) : (
              <>
                <Download size={14} /> Export Document
              </>
            )}
          </LuxuryButton>
        </div>
      </div>
    </div>
  );
};
