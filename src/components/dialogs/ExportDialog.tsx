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

  const downloadBlob = (blob: Blob, filename: string) => {
    if (!blob || blob.size === 0) throw new Error('Export produced an empty file.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * PDF export must use the edited scene graph, not the untouched import canvas.
   * We first rasterize the current scene graph with the same renderer used by
   * PNG/JPEG/WebP export, then wrap that final composite in a valid PDF page.
   */
  const exportEditedPDF = async (): Promise<Blob> => {
    const compositePng = await ImageExporter.exportToBlob(sceneGraph, baseCanvas, {
      format: 'png',
      scale: 1,
      quality: 1,
      includeWatermark,
      watermarkText
    } as ExportConfig);

    const objectUrl = URL.createObjectURL(compositePng);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Unable to prepare edited PDF page.'));
        img.src = objectUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = sceneGraph.canvasWidth;
      canvas.height = sceneGraph.canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to create PDF composition canvas.');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      return PDFParser.exportToPDF([{ canvas }]);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleExecuteExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    try {
      if (format === 'pdf') {
        const pdfBlob = await exportEditedPDF();
        downloadBlob(pdfBlob, `reconstructa_edited_${Date.now()}.pdf`);
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

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(8, 7, 10, 0.85)', backdropFilter: 'blur(8px)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ width: 440, maxWidth: '100%', background: 'var(--surface-base)', border: '1px solid var(--border-gold-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-dark)' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 14, letterSpacing: '0.08em', color: 'var(--gold-light)' }}>EXPORT SPECIFICATION</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-group">
            <span className="field-label">File Format</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {(['png', 'jpeg', 'webp', 'pdf'] as const).map((fmt) => (
                <button key={fmt} onClick={() => setFormat(fmt)} className={`btn-luxury ${format === fmt ? 'btn-luxury-primary' : ''}`} style={{ textTransform: 'uppercase', padding: '6px 4px', fontSize: 11.5 }}>{fmt}</button>
              ))}
            </div>
          </div>

          {format !== 'pdf' && (
            <div className="field-group">
              <span className="field-label">Export Scale</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[1, 2, 3].map((s) => (
                  <button key={s} onClick={() => setScale(s)} className={`btn-luxury ${scale === s ? 'btn-luxury-primary' : ''}`} style={{ padding: '6px 4px', fontSize: 11.5 }}>{s}x ({Math.round(sceneGraph.canvasWidth * s)} × {Math.round(sceneGraph.canvasHeight * s)})</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: 'var(--surface-dark)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={16} style={{ color: 'var(--gold-antique)' }} /><span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-ivory)' }}>Provenance Indicator</span></div>
              <input type="checkbox" checked={includeWatermark} onChange={(e) => setIncludeWatermark(e.target.checked)} style={{ cursor: 'pointer', accentColor: 'var(--gold-antique)' }} />
            </div>
            {includeWatermark && <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} className="input-luxury" placeholder="Watermark text" style={{ fontSize: 11.5 }} />}
          </div>

          {format === 'pdf' && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              PDF export uses the current edited composite, including the imported page background and editable layers.
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-dark)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <LuxuryButton variant="ghost" size="sm" onClick={onClose}>Cancel</LuxuryButton>
          <LuxuryButton variant="primary" size="sm" onClick={handleExecuteExport} disabled={isExporting}>
            {exportSuccess ? <><Check size={14} /> Complete</> : isExporting ? 'Exporting...' : <><Download size={14} /> Export Document</>}
          </LuxuryButton>
        </div>
      </div>
    </div>
  );
};
