/**
 * RECONSTRUCTA — PROJECT VERSION HISTORY & CHECKPOINTS DIALOG
 * Manages persistent named checkpoints (Create, Rename, Restore, Delete, and Compare)
 * completely separate from short-term Undo/Redo history.
 */

import React, { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { ProjectStorage } from '../../engine/project/storage';
import { ProjectVersion } from '../../types/project';
import { LuxuryButton } from '../common/LuxuryButton';
import { History, Plus, RotateCcw, Trash2, Edit3, X, Check } from 'lucide-react';

interface VersionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VersionHistoryDialog: React.FC<VersionHistoryDialogProps> = ({
  isOpen,
  onClose
}) => {
  const { project, setSceneGraph, setProject } = useEditorStore();
  const { pushState } = useHistoryStore();

  const [newVersionName, setNewVersionName] = useState('');
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  if (!isOpen) return null;

  const versions: ProjectVersion[] = project?.versions || [];

  const handleCreateVersion = async () => {
    if (!project) return;
    const name = newVersionName.trim() || `Checkpoint ${versions.length + 1}`;
    const newVer = ProjectStorage.createVersion(project, name);
    await ProjectStorage.saveProject(project);
    setProject({ ...project });
    setNewVersionName('');
    setSelectedVersionId(newVer.versionId);
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!project) return;
    const restoredGraph = ProjectStorage.restoreVersion(project, versionId);
    if (restoredGraph) {
      pushState(restoredGraph);
      setSceneGraph(restoredGraph);
      await ProjectStorage.saveProject(project);
      setProject({ ...project });
      onClose();
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!project) return;
    const updated = {
      ...project,
      versions: project.versions.filter((v) => v.versionId !== versionId)
    };
    await ProjectStorage.saveProject(updated);
    setProject(updated);
    if (selectedVersionId === versionId) setSelectedVersionId(null);
  };

  const handleStartRename = (ver: ProjectVersion) => {
    setEditingVersionId(ver.versionId);
    setEditingName(ver.name);
  };

  const handleCommitRename = async () => {
    if (!project || !editingVersionId) return;
    const target = project.versions.find((v) => v.versionId === editingVersionId);
    if (target && editingName.trim()) {
      target.name = editingName.trim();
      await ProjectStorage.saveProject(project);
      setProject({ ...project });
    }
    setEditingVersionId(null);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 4, 7, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 680,
          maxHeight: '85vh',
          background: 'var(--surface-dark)',
          border: '1px solid var(--gold-border-bright)',
          borderRadius: 12,
          boxShadow: '0 24px 72px rgba(0, 0, 0, 0.9), 0 0 1px rgba(212, 175, 55, 0.4)',
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
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} color="var(--gold-light)" />
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--gold-light)',
                fontFamily: 'Playfair Display, serif',
                margin: 0
              }}
            >
              Project Checkpoints & Versioning
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Create Checkpoint bar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: 'var(--surface-base)'
          }}
        >
          <input
            type="text"
            placeholder="Name for new checkpoint (e.g. 'Pre-header refactor')..."
            value={newVersionName}
            onChange={(e) => setNewVersionName(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              padding: '6px 12px',
              color: 'var(--text-ivory)',
              fontSize: 12,
              outline: 'none'
            }}
          />
          <LuxuryButton size="sm" onClick={handleCreateVersion}>
            <Plus size={13} /> Create Checkpoint
          </LuxuryButton>
        </div>

        {/* Version List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}
        >
          {versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <History size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <p style={{ fontSize: 13 }}>No checkpoints created yet.</p>
              <p style={{ fontSize: 11 }}>Create named checkpoints to save milestones and restore past states.</p>
            </div>
          ) : (
            versions.map((ver) => {
              const isSelected = selectedVersionId === ver.versionId;
              const dateStr = new Date(ver.timestamp).toLocaleString();
              const nodeCount = Object.keys(ver.sceneGraphSnapshot.nodes || {}).length;

              return (
                <div
                  key={ver.versionId}
                  onClick={() => setSelectedVersionId(ver.versionId)}
                  style={{
                    background: isSelected ? 'var(--surface-elevated)' : 'var(--surface-base)',
                    border: isSelected ? '1.5px solid var(--gold-antique)' : '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 120ms ease'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {editingVersionId === ver.versionId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          style={{
                            background: 'var(--surface-sunken)',
                            border: '1px solid var(--gold-antique)',
                            color: 'var(--text-ivory)',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 12
                          }}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCommitRename();
                          }}
                          style={{ background: 'transparent', border: 'none', color: 'var(--status-success)', cursor: 'pointer' }}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-ivory)' }}>
                          {ver.name}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--gold-deep)',
                            background: 'rgba(212, 175, 55, 0.1)',
                            padding: '1px 6px',
                            borderRadius: 3
                          }}
                        >
                          v{ver.versionNumber}
                        </span>
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {dateStr} • {nodeCount} layers
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LuxuryButton
                      size="sm"
                      variant="default"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestoreVersion(ver.versionId);
                      }}
                      title="Restore scene graph from this checkpoint"
                    >
                      <RotateCcw size={12} /> Restore
                    </LuxuryButton>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(ver);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 4
                      }}
                      title="Rename checkpoint"
                    >
                      <Edit3 size={13} />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVersion(ver.versionId);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--status-danger)',
                        cursor: 'pointer',
                        padding: 4
                      }}
                      title="Delete checkpoint"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--surface-base)'
          }}
        >
          <LuxuryButton size="sm" variant="ghost" onClick={onClose}>
            Close
          </LuxuryButton>
        </div>
      </div>
    </div>
  );
};
