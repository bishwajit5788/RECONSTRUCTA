/**
 * RECONSTRUCTA — COMMAND PALETTE (CMD+K / CTRL+K)
 * Fast fuzzy keyboard navigation for tools, export, view modes, and project actions.
 */

import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import {
  Search,
  Download,
  RotateCcw,
  RotateCw,
  Eye,
  Maximize2,
  Grid
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenExport: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onOpenExport }) => {
  const [query, setQuery] = useState('');
  const {
    viewMode,
    setViewMode,
    toggleRulers,
    toggleGrid,
    setZoom,
    setPan
  } = useEditorStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = [
    {
      id: 'export',
      name: 'Export Document / Image',
      category: 'Export',
      shortcut: '⌘E',
      icon: <Download size={14} />,
      action: () => {
        onClose();
        onOpenExport();
      }
    },
    {
      id: 'split_view',
      name: 'Toggle Before/After Split Comparison',
      category: 'View',
      shortcut: 'B',
      icon: <Eye size={14} />,
      action: () => {
        setViewMode(viewMode === 'split' ? 'edit' : 'split');
        onClose();
      }
    },
    {
      id: 'undo',
      name: 'Undo Last Action',
      category: 'History',
      shortcut: '⌘Z',
      icon: <RotateCcw size={14} />,
      action: () => {
        // Trigger undo
        onClose();
      }
    },
    {
      id: 'redo',
      name: 'Redo Action',
      category: 'History',
      shortcut: '⇧⌘Z',
      icon: <RotateCw size={14} />,
      action: () => {
        // Trigger redo
        onClose();
      }
    },
    {
      id: 'toggle_rulers',
      name: 'Toggle Pixel Rulers',
      category: 'Canvas',
      shortcut: '⇧R',
      icon: <Maximize2 size={14} />,
      action: () => {
        toggleRulers();
        onClose();
      }
    },
    {
      id: 'toggle_grid',
      name: 'Toggle Alignment Grid',
      category: 'Canvas',
      shortcut: '⇧G',
      icon: <Grid size={14} />,
      action: () => {
        toggleGrid();
        onClose();
      }
    },
    {
      id: 'reset_zoom',
      name: 'Reset Zoom (100%)',
      category: 'View',
      shortcut: '⌘0',
      icon: <Maximize2 size={14} />,
      action: () => {
        setZoom(1.0);
        setPan(0, 0);
        onClose();
      }
    }
  ];

  const filteredCommands = commands.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) || c.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(8, 7, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 600,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520,
          background: 'var(--surface-base)',
          border: '1px solid var(--border-gold-subtle)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--surface-dark)'
          }}
        >
          <Search size={16} style={{ color: 'var(--gold-antique)' }} />
          <input
            autoFocus
            type="text"
            placeholder="Type a command or search action..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-ivory)',
              fontSize: 13,
              fontFamily: 'var(--font-body)'
            }}
          />
          <kbd
            style={{
              padding: '2px 6px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 3,
              color: 'var(--text-muted)'
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '8px 6px' }}>
          {filteredCommands.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-subtle)' }}>
              No matching commands
            </div>
          ) : (
            filteredCommands.map((cmd) => (
              <div
                key={cmd.id}
                onClick={cmd.action}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-xs)',
                  cursor: 'pointer',
                  transition: 'background 120ms ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-ivory)' }}>
                  <span style={{ color: 'var(--gold-antique)' }}>{cmd.icon}</span>
                  <span style={{ fontSize: 13 }}>{cmd.name}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10.5, color: 'var(--text-subtle)' }}>{cmd.category}</span>
                  {cmd.shortcut && (
                    <kbd
                      style={{
                        padding: '1px 5px',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        background: 'var(--surface-dark)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 3,
                        color: 'var(--text-muted)'
                      }}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
