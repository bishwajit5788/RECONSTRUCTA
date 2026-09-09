/**
 * RECONSTRUCTA — INTERACTIVE CANVAS VIEWPORT
 * 10%–800% zoom, smooth pan, golden rulers, snapping guides, 8 transform handles, and double-click editing.
 */

import React, { useRef, useEffect, useState, MouseEvent, WheelEvent, useCallback } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';

export const CanvasViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    sceneGraph,
    selectedNodeIds,
    activeTool,
    zoom,
    panX,
    panY,
    showRulers,
    showGrid,
    gridSize,
    snapToGuides,
    setZoom,
    setPan,
    setSelectedNodes,
    updateNode
  } = useEditorStore();

  const { pushState } = useHistoryStore();

  // Dragging / Resizing / Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number; nodeW: number; nodeH: number }>({
    mouseX: 0,
    mouseY: 0,
    nodeX: 0,
    nodeY: 0,
    nodeW: 0,
    nodeH: 0
  });

  // Snap guide lines
  const [activeGuideX, setActiveGuideX] = useState<number | null>(null);
  const [activeGuideY, setActiveGuideY] = useState<number | null>(null);

  // Inline editing state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const selectedNode = selectedNodeIds.length === 1 ? sceneGraph.nodes[selectedNodeIds[0]] : null;

  // Render Scene to Main Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { canvasWidth, canvasHeight, backgroundColor, nodes } = sceneGraph;

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    // Clear & background
    ctx.fillStyle = backgroundColor || '#08070A';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.07)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvasWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      for (let y = 0; y < canvasHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }
    }

    // Sort nodes by zIndex
    const sortedNodes = Object.values(nodes)
      .filter((n) => n.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const node of sortedNodes) {
      ctx.save();
      ctx.globalAlpha = node.opacity ?? 1;

      if (node.rotation) {
        ctx.translate(node.x + node.width / 2, node.y + node.height / 2);
        ctx.rotate((node.rotation * Math.PI) / 180);
        ctx.translate(-(node.x + node.width / 2), -(node.y + node.height / 2));
      }

      // Container shapes & message bubbles
      if (node.backgroundColor || node.strokeColor) {
        ctx.fillStyle = node.backgroundColor || 'transparent';
        const radius = node.borderRadius || 6;

        ctx.beginPath();
        ctx.roundRect(node.x, node.y, node.width, node.height, radius);
        if (node.backgroundColor) ctx.fill();

        if (node.strokeColor) {
          ctx.strokeStyle = node.strokeColor;
          ctx.lineWidth = node.strokeWidth || 1;
          ctx.stroke();
        }
      }

      // Text rendering
      if (node.content && node.id !== editingNodeId) {
        const fontSize = node.fontSize || 14;
        const fontFamily = node.fontFamily || 'Inter, sans-serif';
        const fontWeight = node.fontWeight || 400;

        ctx.font = `${node.fontStyle || 'normal'} ${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = node.color || '#FFFFFF';
        ctx.textBaseline = 'top';

        if (node.alignment === 'center') {
          ctx.textAlign = 'center';
          ctx.fillText(node.content, node.x + node.width / 2, node.y + 2);
        } else if (node.alignment === 'right') {
          ctx.textAlign = 'right';
          ctx.fillText(node.content, node.x + node.width - 4, node.y + 2);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(node.content, node.x + 4, node.y + 2);
        }
      }

      ctx.restore();
    }
  }, [sceneGraph, showGrid, gridSize, editingNodeId]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Mouse Wheel Zoom (10% to 800%)
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.1, Math.min(8.0, zoom * zoomFactor));
    setZoom(newZoom);
  };

  // Canvas Mouse Down (Select or Pan)
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // Middle mouse button or pan tool triggers panning
    if (e.button === 1 || activeTool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
      return;
    }

    if (e.button !== 0) return;

    // Check hit test against nodes
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseCanvasX = (e.clientX - rect.left) / zoom;
    const mouseCanvasY = (e.clientY - rect.top) / zoom;

    const hitNode = Object.values(sceneGraph.nodes)
      .filter((n) => n.visible && !n.locked)
      .sort((a, b) => b.zIndex - a.zIndex)
      .find(
        (n) =>
          mouseCanvasX >= n.x &&
          mouseCanvasX <= n.x + n.width &&
          mouseCanvasY >= n.y &&
          mouseCanvasY <= n.y + n.height
      );

    if (hitNode) {
      setSelectedNodes([hitNode.id]);
      setDragHandle('move');
      setDragStart({
        mouseX: e.clientX,
        mouseY: e.clientY,
        nodeX: hitNode.x,
        nodeY: hitNode.y,
        nodeW: hitNode.width,
        nodeH: hitNode.height
      });
      pushState(sceneGraph);
    } else {
      setSelectedNodes([]);
      setEditingNodeId(null);
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPan(e.clientX - panStart.x, e.clientY - panStart.y);
      return;
    }

    if (dragHandle && selectedNode) {
      const deltaX = (e.clientX - dragStart.mouseX) / zoom;
      const deltaY = (e.clientY - dragStart.mouseY) / zoom;

      let newX = dragStart.nodeX;
      let newY = dragStart.nodeY;
      let newW = dragStart.nodeW;
      let newH = dragStart.nodeH;

      if (dragHandle === 'move') {
        newX = Math.round(dragStart.nodeX + deltaX);
        newY = Math.round(dragStart.nodeY + deltaY);

        // Snapping to Canvas Center
        if (snapToGuides) {
          const centerX = sceneGraph.canvasWidth / 2;
          if (Math.abs(newX + newW / 2 - centerX) < 8) {
            newX = Math.round(centerX - newW / 2);
            setActiveGuideX(centerX);
          } else {
            setActiveGuideX(null);
          }
        }
        updateNode(selectedNode.id, { x: newX, y: newY });
      } else if (dragHandle === 'se') {
        newW = Math.max(20, Math.round(dragStart.nodeW + deltaX));
        newH = Math.max(16, Math.round(dragStart.nodeH + deltaY));
        updateNode(selectedNode.id, { width: newW, height: newH });
      } else if (dragHandle === 'e') {
        newW = Math.max(20, Math.round(dragStart.nodeW + deltaX));
        updateNode(selectedNode.id, { width: newW });
      } else if (dragHandle === 's') {
        newH = Math.max(16, Math.round(dragStart.nodeH + deltaY));
        updateNode(selectedNode.id, { height: newH });
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDragHandle(null);
    setActiveGuideX(null);
    setActiveGuideY(null);
  };

  // Double-click to inline edit text
  const handleDoubleClick = () => {
    if (selectedNode && selectedNode.content !== undefined) {
      setEditingNodeId(selectedNode.id);
      setEditingText(selectedNode.content);
    }
  };

  const handleTextEditCommit = () => {
    if (editingNodeId) {
      pushState(sceneGraph);
      updateNode(editingNodeId, { content: editingText }, true);
      setEditingNodeId(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className="canvas-viewport-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: isPanning ? 'grabbing' : activeTool === 'pan' ? 'grab' : 'default' }}
    >
      {/* Top Luxury Ruler */}
      {showRulers && (
        <>
          <div className="canvas-ruler-corner" />
          <div className="canvas-ruler-horizontal">
            <svg width="100%" height="22">
              {Array.from({ length: 100 }).map((_, i) => (
                <g key={i}>
                  <line
                    x1={i * 50 * zoom + panX}
                    y1={12}
                    x2={i * 50 * zoom + panX}
                    y2={22}
                    stroke="rgba(212, 175, 55, 0.4)"
                    strokeWidth={1}
                  />
                  <text
                    x={i * 50 * zoom + panX + 4}
                    y={11}
                    fill="#8C6A20"
                    fontSize={9}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {i * 50}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          {/* Left Luxury Ruler */}
          <div className="canvas-ruler-vertical">
            <svg width="22" height="100%">
              {Array.from({ length: 100 }).map((_, i) => (
                <g key={i}>
                  <line
                    x1={12}
                    y1={i * 50 * zoom + panY}
                    x2={22}
                    y2={i * 50 * zoom + panY}
                    stroke="rgba(212, 175, 55, 0.4)"
                    strokeWidth={1}
                  />
                  <text
                    x={2}
                    y={i * 50 * zoom + panY + 12}
                    fill="#8C6A20"
                    fontSize={8.5}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {i * 50}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </>
      )}

      {/* Dynamic Magnetic Snapping Guide Lines */}
      {activeGuideX !== null && (
        <div
          className="canvas-guide-line-x"
          style={{ left: `${activeGuideX * zoom + panX}px` }}
        />
      )}
      {activeGuideY !== null && (
        <div
          className="canvas-guide-line-y"
          style={{ top: `${activeGuideY * zoom + panY}px` }}
        />
      )}

      {/* Main Scaled Canvas Surface */}
      <div
        style={{
          position: 'absolute',
          left: `${panX}px`,
          top: `${panY}px`,
          transform: `scale(${zoom})`,
          transformOrigin: '0 0',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.9), 0 0 1px rgba(212, 175, 55, 0.3)'
        }}
      >
        <canvas ref={canvasRef} />

        {/* Selected Element Bounding Box & 8 Handles */}
        {selectedNode && editingNodeId !== selectedNode.id && (
          <div
            className="canvas-selection-box"
            style={{
              left: `${selectedNode.x}px`,
              top: `${selectedNode.y}px`,
              width: `${selectedNode.width}px`,
              height: `${selectedNode.height}px`
            }}
          >
            {/* 8 Resize Handles */}
            <div className="canvas-handle" style={{ top: 0, left: 0, cursor: 'nwse-resize' }} />
            <div className="canvas-handle" style={{ top: 0, left: '50%', cursor: 'ns-resize' }} />
            <div className="canvas-handle" style={{ top: 0, left: '100%', cursor: 'nesw-resize' }} />
            <div
              className="canvas-handle"
              style={{ top: '50%', left: '100%', cursor: 'ew-resize' }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragHandle('e');
                setDragStart({ mouseX: e.clientX, mouseY: e.clientY, nodeX: selectedNode.x, nodeY: selectedNode.y, nodeW: selectedNode.width, nodeH: selectedNode.height });
              }}
            />
            <div
              className="canvas-handle"
              style={{ top: '100%', left: '100%', cursor: 'nwse-resize' }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragHandle('se');
                setDragStart({ mouseX: e.clientX, mouseY: e.clientY, nodeX: selectedNode.x, nodeY: selectedNode.y, nodeW: selectedNode.width, nodeH: selectedNode.height });
              }}
            />
            <div
              className="canvas-handle"
              style={{ top: '100%', left: '50%', cursor: 'ns-resize' }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragHandle('s');
                setDragStart({ mouseX: e.clientX, mouseY: e.clientY, nodeX: selectedNode.x, nodeY: selectedNode.y, nodeW: selectedNode.width, nodeH: selectedNode.height });
              }}
            />
            <div className="canvas-handle" style={{ top: '100%', left: 0, cursor: 'nesw-resize' }} />
            <div className="canvas-handle" style={{ top: '50%', left: 0, cursor: 'ew-resize' }} />
          </div>
        )}

        {/* Inline Text Editor Overlay */}
        {editingNodeId && selectedNode && (
          <textarea
            autoFocus
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={handleTextEditCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTextEditCommit();
              } else if (e.key === 'Escape') {
                setEditingNodeId(null);
              }
            }}
            style={{
              position: 'absolute',
              left: `${selectedNode.x}px`,
              top: `${selectedNode.y}px`,
              width: `${selectedNode.width}px`,
              height: `${selectedNode.height}px`,
              fontSize: `${selectedNode.fontSize || 14}px`,
              fontFamily: selectedNode.fontFamily || 'Inter, sans-serif',
              fontWeight: selectedNode.fontWeight || 400,
              color: selectedNode.color || '#FFFFFF',
              background: 'rgba(20, 16, 24, 0.95)',
              border: '1.5px solid var(--gold-antique)',
              borderRadius: '4px',
              padding: '2px 4px',
              outline: 'none',
              resize: 'none',
              zIndex: 100
            }}
          />
        )}
      </div>
    </div>
  );
};
