/**
 * RECONSTRUCTA — LUXURY WORKSTATION HEADER
 * Obsidian surface with Antique Gold accents, platform selector, local-first badge, and export triggers.
 */

import React, { useRef } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { LuxuryButton } from '../common/LuxuryButton';
import {
  MousePointer,
  Hand,
  Columns,
  RotateCcw,
  RotateCw,
  Upload,
  Download,
  Command,
  Shield,
  Menu
} from 'lucide-react';

interface LuxuryHeaderProps {
  onFileUpload: (file: File) => void;
  onOpenExport: () => void;
  onOpenCommandPalette: () => void;
}

export const LuxuryHeader: React.FC<LuxuryHeaderProps> = ({
  onFileUpload,
  onOpenExport,
  onOpenCommandPalette
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    activeTool,
    viewMode,
    isBackendConnected,
    isLocalOnlyMode,
    sceneGraph,
    setActiveTool,
    setViewMode,
    setSceneGraph,
    setLocalOnlyMode,
    toggleLeftDrawer
  } = useEditorStore();

  const { canUndo, canRedo, undo, redo } = useHistoryStore();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  const handleUndo = () => {
    const prev = undo(sceneGraph);
    if (prev) setSceneGraph(prev);
  };

  const handleRedo = () => {
    const next = redo(sceneGraph);
    if (next) setSceneGraph(next);
  };

  return (
    <header className="app-header">
      {/* Left Brand & Platform Selection */}
      <div className="header-brand">
        <button
          className="tool-button"
          onClick={toggleLeftDrawer}
          title="Toggle Layers panel"
          style={{ display: 'none' }}
        >
          <Menu size={16} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="brand-title">RECONSTRUCTA</span>
          <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Visual & Document Workstation
          </span>
        </div>

        {/* Local Processing vs Hybrid Status Badge (Requirement 21) */}
        <div
          onClick={() => setLocalOnlyMode(!isLocalOnlyMode)}
          className={isBackendConnected && !isLocalOnlyMode ? 'mode-badge-hybrid' : 'mode-badge-local'}
          style={{ cursor: 'pointer' }}
          title={
            isBackendConnected && !isLocalOnlyMode
              ? 'Backend OpenCV Inpainting connected. Click to force local-only mode.'
              : 'Local-First Mode: 100% in-browser processing with zero network leakage.'
          }
        >
          <Shield size={11} />
          <span>{isBackendConnected && !isLocalOnlyMode ? 'BACKEND HYBRID' : 'LOCAL ONLY'}</span>
        </div>
      </div>

      {/* Center Tool Switcher */}
      <div className="header-center">
        <button
          className={`tool-button ${activeTool === 'select' ? 'active' : ''}`}
          onClick={() => setActiveTool('select')}
          title="Select & Transform (V)"
        >
          <MousePointer size={15} />
        </button>

        <button
          className={`tool-button ${activeTool === 'pan' ? 'active' : ''}`}
          onClick={() => setActiveTool('pan')}
          title="Pan Viewport (H / Space)"
        >
          <Hand size={15} />
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 4px' }} />

        <button
          className={`tool-button ${viewMode === 'split' ? 'active' : ''}`}
          onClick={() => setViewMode(viewMode === 'split' ? 'edit' : 'split')}
          title="Before / After Split Slider (B)"
        >
          <Columns size={15} />
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Undo / Redo */}
        <button
          className="tool-button"
          onClick={handleUndo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          style={{ opacity: canUndo ? 1 : 0.4 }}
        >
          <RotateCcw size={15} />
        </button>

        <button
          className="tool-button"
          onClick={handleRedo}
          disabled={!canRedo}
          title="Redo (⇧⌘Z)"
          style={{ opacity: canRedo ? 1 : 0.4 }}
        >
          <RotateCw size={15} />
        </button>
      </div>

      {/* Right Actions (Import / Export / Command Palette) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf,.eml,.docx,.pptx,.reconstructa"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <LuxuryButton
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          title="Import Screenshot, PDF, EML, or DOCX"
        >
          <Upload size={13} /> Import
        </LuxuryButton>

        <LuxuryButton
          size="sm"
          variant="primary"
          onClick={onOpenExport}
          title="Export High-Res Image or PDF (⌘E)"
        >
          <Download size={13} /> Export
        </LuxuryButton>

        <LuxuryButton
          size="icon"
          variant="ghost"
          onClick={onOpenCommandPalette}
          title="Command Palette (⌘K)"
        >
          <Command size={14} />
        </LuxuryButton>
      </div>
    </header>
  );
};
