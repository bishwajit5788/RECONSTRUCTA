/**
 * RECONSTRUCTA — ASSET GALLERY & RESOURCE LIBRARY
 * Browses uploaded images, avatars, icons, and document media with 2-hour TTL expiration tracking,
 * search, filtering, preview, and canvas insertion.
 */

import React, { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { ProjectAsset } from '../../types/project';
import { SceneNode } from '../../types/sceneGraph';
import { LuxuryButton } from '../common/LuxuryButton';
import { Image, Search, Plus, Clock, X } from 'lucide-react';

interface AssetGalleryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertAsset?: (asset: ProjectAsset) => void;
}

export const AssetGalleryDialog: React.FC<AssetGalleryDialogProps> = ({
  isOpen,
  onClose,
  onInsertAsset
}) => {
  const { project, sceneGraph, addNode } = useEditorStore();
  const { pushState } = useHistoryStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedAsset, setSelectedAsset] = useState<ProjectAsset | null>(null);

  if (!isOpen) return null;

  const assets: ProjectAsset[] = project ? Object.values(project.assets || {}) : [];

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || asset.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleInsert = (asset: ProjectAsset) => {
    pushState(sceneGraph);
    const nodeId = `asset_node_${Date.now()}`;
    const newNode: SceneNode = {
      id: nodeId,
      name: asset.name,
      type: asset.type === 'avatar' ? 'avatar' : asset.type === 'icon' ? 'icon' : 'image',
      parentId: null,
      childrenIds: [],
      x: 100,
      y: 100,
      width: asset.type === 'avatar' ? 48 : asset.type === 'icon' ? 32 : 240,
      height: asset.type === 'avatar' ? 48 : asset.type === 'icon' ? 32 : 180,
      rotation: 0,
      opacity: 1,
      zIndex: 15,
      visible: true,
      locked: false,
      src: asset.dataUrl,
      mask: asset.type === 'avatar' ? 'circle' : 'none',
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      source: 'manual'
    };

    addNode(newNode);
    if (onInsertAsset) onInsertAsset(asset);
    onClose();
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
          width: 720,
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
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--gold-light)',
                fontFamily: 'Playfair Display, serif',
                margin: 0
              }}
            >
              Asset Library & Gallery
            </h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Temporary session assets (Auto-purged after 2 hours)
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 12,
            alignItems: 'center'
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              padding: '6px 10px',
              gap: 8
            }}
          >
            <Search size={14} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search assets by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-ivory)',
                fontSize: 12,
                outline: 'none',
                width: '100%'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'image', 'avatar', 'icon', 'document'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                style={{
                  background: filterType === type ? 'var(--gold-antique)' : 'var(--surface-sunken)',
                  color: filterType === type ? '#000000' : 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'capitalize',
                  padding: '4px 8px',
                  cursor: 'pointer'
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Gallery Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: 14
          }}
        >
          {filteredAssets.length === 0 ? (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13
              }}
            >
              <Image size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <p>No assets found in current session.</p>
              <p style={{ fontSize: 11 }}>Upload an image, PDF, or document to populate the gallery.</p>
            </div>
          ) : (
            filteredAssets.map((asset) => {
              const isSelected = selectedAsset?.id === asset.id;
              const remainingMin = Math.max(0, Math.round((asset.createdAt + 7200 * 1000 - Date.now()) / 60000));

              return (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  style={{
                    background: isSelected ? 'var(--surface-elevated)' : 'var(--surface-base)',
                    border: isSelected ? '1.5px solid var(--gold-antique)' : '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    transition: 'all 120ms ease'
                  }}
                >
                  <div
                    style={{
                      height: 100,
                      background: '#120F16',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden'
                    }}
                  >
                    <img
                      src={asset.dataUrl}
                      alt={asset.name}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain'
                      }}
                    />
                  </div>

                  <div style={{ padding: '8px' }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-ivory)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {asset.name}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 4,
                        fontSize: 9.5,
                        color: 'var(--text-muted)'
                      }}
                    >
                      <span style={{ textTransform: 'uppercase' }}>{asset.type}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--gold-deep)' }}>
                        <Clock size={10} /> {remainingMin}m
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-base)'
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {selectedAsset ? `Selected: ${selectedAsset.name}` : 'Select an asset to insert onto the canvas'}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <LuxuryButton size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </LuxuryButton>
            <LuxuryButton
              size="sm"
              disabled={!selectedAsset}
              onClick={() => selectedAsset && handleInsert(selectedAsset)}
            >
              <Plus size={13} /> Insert to Canvas
            </LuxuryButton>
          </div>
        </div>
      </div>
    </div>
  );
};
