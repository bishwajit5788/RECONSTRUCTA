/**
 * RECONSTRUCTA — LAYER TREE PANEL
 * Professional layer management: visibility, lock, rename, duplicate, delete, reorder, search, and semantic icons.
 */

import React, { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  Type,
  MessageSquare,
  User,
  Image as ImageIcon,
  Square,
  Clock,
  Navigation,
  Search
} from 'lucide-react';
import { ElementType, SceneNode } from '../../types/sceneGraph';

export const LayerTree: React.FC = () => {
  const { sceneGraph, selectedNodeIds, setSelectedNodes, updateNode, deleteNodes, addNode } =
    useEditorStore();
  const { pushState } = useHistoryStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const nodes = Object.values(sceneGraph.nodes).sort((a, b) => b.zIndex - a.zIndex);
  const filteredNodes = nodes.filter((n) =>
    (n.name || n.content || n.type).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getLayerIcon = (type: ElementType) => {
    switch (type) {
      case 'text':
      case 'heading':
        return <Type size={14} className="text-gold" />;
      case 'message':
        return <MessageSquare size={14} style={{ color: '#6D3FA8' }} />;
      case 'avatar':
      case 'name':
        return <User size={14} style={{ color: '#D4AF37' }} />;
      case 'image':
      case 'media':
        return <ImageIcon size={14} style={{ color: '#4682B4' }} />;
      case 'timestamp':
        return <Clock size={14} style={{ color: '#9D96A5' }} />;
      case 'status-bar':
      case 'navigation-bar':
        return <Navigation size={14} style={{ color: '#6E1F2A' }} />;
      default:
        return <Square size={14} style={{ color: '#9D96A5' }} />;
    }
  };

  const handleToggleVisibility = (e: React.MouseEvent, node: SceneNode) => {
    e.stopPropagation();
    pushState(sceneGraph);
    updateNode(node.id, { visible: !node.visible });
  };

  const handleToggleLock = (e: React.MouseEvent, node: SceneNode) => {
    e.stopPropagation();
    pushState(sceneGraph);
    updateNode(node.id, { locked: !node.locked });
  };

  const handleDuplicate = (e: React.MouseEvent, node: SceneNode) => {
    e.stopPropagation();
    pushState(sceneGraph);
    const dupNode: SceneNode = {
      ...JSON.parse(JSON.stringify(node)),
      id: `layer_${Date.now()}_dup`,
      name: `${node.name} (Copy)`,
      x: node.x + 15,
      y: node.y + 15,
      zIndex: node.zIndex + 1
    };
    addNode(dupNode);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    pushState(sceneGraph);
    deleteNodes([id]);
  };

  const handleStartRename = (node: SceneNode) => {
    setEditingLayerId(node.id);
    setRenameText(node.name);
  };

  const handleCommitRename = (id: string) => {
    if (renameText.trim()) {
      pushState(sceneGraph);
      updateNode(id, { name: renameText.trim() });
    }
    setEditingLayerId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search & Filter */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search
          size={13}
          style={{ position: 'absolute', left: 8, top: 9, color: 'var(--text-subtle)' }}
        />
        <input
          type="text"
          placeholder="Filter layers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-luxury"
          style={{ width: '100%', paddingLeft: 26, fontSize: 11.5 }}
        />
      </div>

      {/* Layer List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filteredNodes.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: 'var(--text-subtle)',
              fontSize: 12
            }}
          >
            No layers found
          </div>
        ) : (
          filteredNodes.map((node) => {
            const isSelected = selectedNodeIds.includes(node.id);
            return (
              <div
                key={node.id}
                className={`layer-row ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedNodes([node.id])}
                onDoubleClick={() => handleStartRename(node)}
                style={{ opacity: node.visible ? 1 : 0.45 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden' }}>
                  {getLayerIcon(node.type)}
                  {editingLayerId === node.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => handleCommitRename(node.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCommitRename(node.id)}
                      className="input-luxury"
                      style={{ padding: '1px 4px', fontSize: 11.5, height: 20 }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: isSelected ? 'var(--gold-light)' : 'var(--text-ivory)'
                      }}
                    >
                      {node.name || node.content || node.type}
                    </span>
                  )}
                </div>

                {/* Layer Control Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    className="tool-button"
                    style={{ width: 22, height: 22 }}
                    onClick={(e) => handleToggleVisibility(e, node)}
                    title={node.visible ? 'Hide layer' : 'Show layer'}
                  >
                    {node.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>

                  <button
                    className="tool-button"
                    style={{ width: 22, height: 22 }}
                    onClick={(e) => handleToggleLock(e, node)}
                    title={node.locked ? 'Unlock layer' : 'Lock layer'}
                  >
                    {node.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>

                  <button
                    className="tool-button"
                    style={{ width: 22, height: 22 }}
                    onClick={(e) => handleDuplicate(e, node)}
                    title="Duplicate layer"
                  >
                    <Copy size={12} />
                  </button>

                  <button
                    className="tool-button"
                    style={{ width: 22, height: 22, color: 'var(--burgundy-royal)' }}
                    onClick={(e) => handleDelete(e, node.id)}
                    title="Delete layer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
