/**
 * RECONSTRUCTA — INTERACTIVE CANVAS VIEWPORT
 * 10%–800% zoom, smooth pan, luxury rulers, dynamic snapping guides,
 * all 8 transform resize handles (NW, N, NE, E, SE, S, SW, W), interactive rotation,
 * marquee multi-selection, group drag, keyboard movement, and double-click multiline editing.
 */

import React, { useRef, useEffect, useState, MouseEvent, WheelEvent, useCallback } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { SceneNode } from '../../types/sceneGraph';

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
    updateNode,
    addNode,
    deleteNodes
  } = useEditorStore();

  const { pushState } = useHistoryStore();

  // Panning & dragging state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Transform handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | 'move' | null
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{
    mouseX: number;
    mouseY: number;
    nodesInitial: Record<string, { x: number; y: number; width: number; height: number; rotation: number }>;
  }>({ mouseX: 0, mouseY: 0, nodesInitial: {} });

  // Marquee selection box
  const [isMarquee, setIsMarquee] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null);

  // Snap guide lines
  const [activeGuideX, setActiveGuideX] = useState<number | null>(null);
  const [activeGuideY, setActiveGuideY] = useState<number | null>(null);

  // Inline text editing state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const primarySelectedNode =
    selectedNodeIds.length === 1 ? sceneGraph.nodes[selectedNodeIds[0]] : null;

  // Render Scene to HTML5 Canvas
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

    // Clear background
    ctx.fillStyle = backgroundColor || '#08070A';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Optional Grid
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

      // Rotation around node center
      if (node.rotation) {
        ctx.translate(node.x + node.width / 2, node.y + node.height / 2);
        ctx.rotate((node.rotation * Math.PI) / 180);
        ctx.translate(-(node.x + node.width / 2), -(node.y + node.height / 2));
      }

      // Container shapes & bubbles
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

      // Multiline Text Rendering with Word Wrapping
      if (node.content && node.id !== editingNodeId) {
        const fontSize = node.fontSize || 14;
        const fontFamily = node.fontFamily || 'Inter, sans-serif';
        const fontWeight = node.fontWeight || 400;

        ctx.font = `${node.fontStyle || 'normal'} ${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = node.color || '#FFFFFF';
        ctx.textBaseline = 'top';

        const paragraphs = node.content.split(/\r?\n/);
        const maxLineWidth = Math.max(node.width - 8, 20);
        const lines: string[] = [];

        for (const para of paragraphs) {
          if (!para) {
            lines.push('');
            continue;
          }
          const words = para.split(' ');
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(testLine).width > maxLineWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
        }

        const lineHeight = fontSize * (node.lineHeight || 1.25);
        lines.forEach((lineText, idx) => {
          const lineY = node.y + 2 + idx * lineHeight;
          if (node.alignment === 'center') {
            ctx.textAlign = 'center';
            ctx.fillText(lineText, node.x + node.width / 2, lineY);
          } else if (node.alignment === 'right') {
            ctx.textAlign = 'right';
            ctx.fillText(lineText, node.x + node.width - 4, lineY);
          } else {
            ctx.textAlign = 'left';
            ctx.fillText(lineText, node.x + 4, lineY);
          }
        });
      }

      ctx.restore();
    }
  }, [sceneGraph, showGrid, gridSize, editingNodeId]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Transform matrix inverse hit-testing respecting rotation
  const getTopNodeAtPoint = (canvasX: number, canvasY: number): SceneNode | null => {
    const sorted = Object.values(sceneGraph.nodes)
      .filter((n) => n.visible)
      .sort((a, b) => b.zIndex - a.zIndex); // Topmost first

    for (const node of sorted) {
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const rotRad = -((node.rotation || 0) * Math.PI) / 180;

      // Rotate point back into node's local non-rotated axis
      const dx = canvasX - cx;
      const dy = canvasY - cy;
      const localX = cx + (dx * Math.cos(rotRad) - dy * Math.sin(rotRad));
      const localY = cy + (dx * Math.sin(rotRad) + dy * Math.cos(rotRad));

      if (
        localX >= node.x &&
        localX <= node.x + node.width &&
        localY >= node.y &&
        localY <= node.y + node.height
      ) {
        return node;
      }
    }
    return null;
  };

  // Keyboard navigation: Arrow movement, Delete, Cmd+A, Cmd+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId) return; // Do not intercept typing during inline edit

      const hasSelection = selectedNodeIds.length > 0;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const unlockedIds = Object.values(sceneGraph.nodes)
          .filter((n) => !n.locked && n.visible)
          .map((n) => n.id);
        setSelectedNodes(unlockedIds);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && hasSelection) {
        e.preventDefault();
        pushState(sceneGraph);
        const newIds: string[] = [];
        for (const id of selectedNodeIds) {
          const original = sceneGraph.nodes[id];
          if (original) {
            const copyId = `copy_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const copyNode: SceneNode = {
              ...original,
              id: copyId,
              name: `${original.name} Copy`,
              x: original.x + 20,
              y: original.y + 20,
              zIndex: original.zIndex + 1
            };
            addNode(copyNode);
            newIds.push(copyId);
          }
        }
        setSelectedNodes(newIds);
        return;
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && hasSelection) {
        e.preventDefault();
        pushState(sceneGraph);
        deleteNodes(selectedNodeIds);
        return;
      }

      // Arrow keys movement
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && hasSelection) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowUp') dy = -step;
        if (e.key === 'ArrowDown') dy = step;
        if (e.key === 'ArrowLeft') dx = -step;
        if (e.key === 'ArrowRight') dx = step;

        for (const id of selectedNodeIds) {
          const node = sceneGraph.nodes[id];
          if (node && !node.locked) {
            updateNode(id, { x: node.x + dx, y: node.y + dy }, false);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingNodeId, selectedNodeIds, sceneGraph, setSelectedNodes, pushState, addNode, deleteNodes, updateNode]);

  // Zoom on wheel (clamped 10% to 800%)
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom(zoom * zoomFactor);
    } else {
      setPan(panX - e.deltaX, panY - e.deltaY);
    }
  };

  // Convert client mouse coordinates to canvas-space coordinates
  const clientToCanvasCoord = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const vx = clientX - rect.left - panX;
    const vy = clientY - rect.top - panY;
    return {
      x: vx / zoom,
      y: vy / zoom
    };
  };

  // Start Pan / Drag / Marquee Selection
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // Left-click pan tool or middle mouse button
    if (activeTool === 'pan' || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
      return;
    }

    if (e.button !== 0) return; // Only primary button

    const { x: cx, y: cy } = clientToCanvasCoord(e.clientX, e.clientY);
    const clickedNode = getTopNodeAtPoint(cx, cy);

    if (clickedNode) {
      if (clickedNode.locked) {
        // Locked nodes can be selected to view properties, but not dragged
        setSelectedNodes([clickedNode.id]);
        return;
      }

      // Multi-select with Shift or Cmd/Ctrl
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (selectedNodeIds.includes(clickedNode.id)) {
          setSelectedNodes(selectedNodeIds.filter((id) => id !== clickedNode.id));
        } else {
          setSelectedNodes([...selectedNodeIds, clickedNode.id]);
        }
      } else if (!selectedNodeIds.includes(clickedNode.id)) {
        setSelectedNodes([clickedNode.id]);
      }

      // Initiate move operation
      setDragHandle('move');
      const nodesInitial: Record<string, { x: number; y: number; width: number; height: number; rotation: number }> = {};
      const activeIds = selectedNodeIds.includes(clickedNode.id) ? selectedNodeIds : [clickedNode.id];
      for (const id of activeIds) {
        const n = sceneGraph.nodes[id];
        if (n && !n.locked) {
          nodesInitial[id] = { x: n.x, y: n.y, width: n.width, height: n.height, rotation: n.rotation || 0 };
        }
      }

      setDragStart({ mouseX: e.clientX, mouseY: e.clientY, nodesInitial });
      pushState(sceneGraph);
    } else {
      // Empty canvas clicked: initiate marquee rubber-band selection or deselect
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
        setSelectedNodes([]);
      }
      setIsMarquee(true);
      setMarqueeStart({ x: cx, y: cy });
      setMarqueeCurrent({ x: cx, y: cy });
    }
  };

  // Dragging: Panning, Moving, 8-Handle Resizing, Rotation, or Marquee
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPan(e.clientX - panStart.x, e.clientY - panStart.y);
      return;
    }

    if (isMarquee && marqueeStart) {
      const { x: cx, y: cy } = clientToCanvasCoord(e.clientX, e.clientY);
      setMarqueeCurrent({ x: cx, y: cy });
      return;
    }

    if (!dragHandle) return;

    const dx = (e.clientX - dragStart.mouseX) / zoom;
    const dy = (e.clientY - dragStart.mouseY) / zoom;

    // 1. Moving selected node(s)
    if (dragHandle === 'move') {
      let snapX = null;
      let snapY = null;

      for (const [id, initial] of Object.entries(dragStart.nodesInitial)) {
        let newX = Math.round(initial.x + dx);
        let newY = Math.round(initial.y + dy);

        // Magnetic Snapping Guides
        if (snapToGuides) {
          const snapDistance = 6;
          for (const other of Object.values(sceneGraph.nodes)) {
            if (other.id === id || selectedNodeIds.includes(other.id)) continue;
            if (Math.abs(newX - other.x) < snapDistance) {
              newX = other.x;
              snapX = other.x;
            }
            if (Math.abs(newY - other.y) < snapDistance) {
              newY = other.y;
              snapY = other.y;
            }
          }
        }

        updateNode(id, { x: newX, y: newY }, false);
      }

      setActiveGuideX(snapX);
      setActiveGuideY(snapY);
      return;
    }

    // 2. Rotation
    if (dragHandle === 'rotate' && primarySelectedNode) {
      const initial = dragStart.nodesInitial[primarySelectedNode.id];
      if (!initial) return;

      const centerX = initial.x + initial.width / 2;
      const centerY = initial.y + initial.height / 2;
      const { x: mouseCanvasX, y: mouseCanvasY } = clientToCanvasCoord(e.clientX, e.clientY);

      const rad = Math.atan2(mouseCanvasY - centerY, mouseCanvasX - centerX);
      let deg = Math.round((rad * 180) / Math.PI) + 90;
      if (deg < 0) deg += 360;

      // Snapping to 0, 45, 90, 135, 180, 225, 270, 315, 360
      const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
      for (const sa of snapAngles) {
        if (Math.abs(deg - sa) < 4) {
          deg = sa % 360;
          break;
        }
      }

      updateNode(primarySelectedNode.id, { rotation: deg }, false);
      return;
    }

    // 3. All 8 Resize Handles (NW, N, NE, E, SE, S, SW, W)
    if (primarySelectedNode && dragStart.nodesInitial[primarySelectedNode.id]) {
      const init = dragStart.nodesInitial[primarySelectedNode.id];
      let newX = init.x;
      let newY = init.y;
      let newW = init.width;
      let newH = init.height;

      const isProportional = e.shiftKey;
      const initialRatio = init.width / Math.max(init.height, 1);

      // E
      if (dragHandle.includes('e')) {
        newW = Math.max(20, init.width + dx);
      }
      // W
      if (dragHandle.includes('w')) {
        const potentialW = init.width - dx;
        if (potentialW >= 20) {
          newW = potentialW;
          newX = init.x + dx;
        }
      }
      // S
      if (dragHandle.includes('s')) {
        newH = Math.max(16, init.height + dy);
      }
      // N
      if (dragHandle.includes('n')) {
        const potentialH = init.height - dy;
        if (potentialH >= 16) {
          newH = potentialH;
          newY = init.y + dy;
        }
      }

      // Proportional resizing adjustment
      if (isProportional && (dragHandle === 'se' || dragHandle === 'nw' || dragHandle === 'ne' || dragHandle === 'sw')) {
        newH = Math.round(newW / initialRatio);
      }

      updateNode(
        primarySelectedNode.id,
        {
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newW),
          height: Math.round(newH)
        },
        true
      );
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDragHandle(null);
    setActiveGuideX(null);
    setActiveGuideY(null);

    // Finalize Marquee Selection
    if (isMarquee && marqueeStart && marqueeCurrent) {
      const minX = Math.min(marqueeStart.x, marqueeCurrent.x);
      const maxX = Math.max(marqueeStart.x, marqueeCurrent.x);
      const minY = Math.min(marqueeStart.y, marqueeCurrent.y);
      const maxY = Math.max(marqueeStart.y, marqueeCurrent.y);

      // Only select if dragged more than 4px
      if (maxX - minX > 4 || maxY - minY > 4) {
        const enclosedIds = Object.values(sceneGraph.nodes)
          .filter(
            (n) =>
              !n.locked &&
              n.visible &&
              n.x + n.width >= minX &&
              n.x <= maxX &&
              n.y + n.height >= minY &&
              n.y <= maxY
          )
          .map((n) => n.id);
        setSelectedNodes(enclosedIds);
      }
      setIsMarquee(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }
  };

  // Double-click to inline edit text
  const handleDoubleClick = () => {
    if (primarySelectedNode && primarySelectedNode.content !== undefined && !primarySelectedNode.locked) {
      setEditingNodeId(primarySelectedNode.id);
      setEditingText(primarySelectedNode.content);
    }
  };

  const handleTextEditCommit = () => {
    if (editingNodeId) {
      pushState(sceneGraph);
      updateNode(editingNodeId, { content: editingText }, true);
      setEditingNodeId(null);
    }
  };

  // Helper to initiate resize handle drag
  const startHandleDrag = (handle: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!primarySelectedNode || primarySelectedNode.locked) return;

    setDragHandle(handle);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodesInitial: {
        [primarySelectedNode.id]: {
          x: primarySelectedNode.x,
          y: primarySelectedNode.y,
          width: primarySelectedNode.width,
          height: primarySelectedNode.height,
          rotation: primarySelectedNode.rotation || 0
        }
      }
    });
    pushState(sceneGraph);
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

      {/* Marquee Rubber-band Selection Box */}
      {isMarquee && marqueeStart && marqueeCurrent && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.min(marqueeStart.x, marqueeCurrent.x) * zoom + panX}px`,
            top: `${Math.min(marqueeStart.y, marqueeCurrent.y) * zoom + panY}px`,
            width: `${Math.abs(marqueeCurrent.x - marqueeStart.x) * zoom}px`,
            height: `${Math.abs(marqueeCurrent.y - marqueeStart.y) * zoom}px`,
            border: '1px dashed var(--gold-antique)',
            background: 'rgba(212, 175, 55, 0.12)',
            pointerEvents: 'none',
            zIndex: 40
          }}
        />
      )}

      {/* Scaled Canvas Surface */}
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

        {/* Highlight Outlines for Multi-selection */}
        {selectedNodeIds.length > 1 &&
          selectedNodeIds.map((id) => {
            const n = sceneGraph.nodes[id];
            if (!n || !n.visible) return null;
            return (
              <div
                key={id}
                style={{
                  position: 'absolute',
                  left: `${n.x}px`,
                  top: `${n.y}px`,
                  width: `${n.width}px`,
                  height: `${n.height}px`,
                  border: '1px dashed var(--gold-antique)',
                  transform: `rotate(${n.rotation || 0}deg)`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                  zIndex: 28
                }}
              />
            );
          })}

        {/* Primary Selected Element: Bounding Box, 8 Handles & Rotation Knob */}
        {primarySelectedNode && editingNodeId !== primarySelectedNode.id && (
          <div
            className="canvas-selection-box"
            style={{
              left: `${primarySelectedNode.x}px`,
              top: `${primarySelectedNode.y}px`,
              width: `${primarySelectedNode.width}px`,
              height: `${primarySelectedNode.height}px`,
              transform: `rotate(${primarySelectedNode.rotation || 0}deg)`,
              transformOrigin: 'center center'
            }}
          >
            {!primarySelectedNode.locked && (
              <>
                {/* Rotation Stem & Knob */}
                <div className="canvas-rotate-stem" style={{ left: '50%', top: '-20px', height: '20px' }} />
                <div
                  className="canvas-rotate-handle"
                  style={{ left: '50%', top: '-24px' }}
                  onMouseDown={(e) => startHandleDrag('rotate', e)}
                  title="Drag to rotate"
                />

                {/* All 8 Resize Handles */}
                {/* NW */}
                <div
                  className="canvas-handle"
                  style={{ top: 0, left: 0, cursor: 'nwse-resize' }}
                  onMouseDown={(e) => startHandleDrag('nw', e)}
                />
                {/* N */}
                <div
                  className="canvas-handle"
                  style={{ top: 0, left: '50%', cursor: 'ns-resize' }}
                  onMouseDown={(e) => startHandleDrag('n', e)}
                />
                {/* NE */}
                <div
                  className="canvas-handle"
                  style={{ top: 0, left: '100%', cursor: 'nesw-resize' }}
                  onMouseDown={(e) => startHandleDrag('ne', e)}
                />
                {/* E */}
                <div
                  className="canvas-handle"
                  style={{ top: '50%', left: '100%', cursor: 'ew-resize' }}
                  onMouseDown={(e) => startHandleDrag('e', e)}
                />
                {/* SE */}
                <div
                  className="canvas-handle"
                  style={{ top: '100%', left: '100%', cursor: 'nwse-resize' }}
                  onMouseDown={(e) => startHandleDrag('se', e)}
                />
                {/* S */}
                <div
                  className="canvas-handle"
                  style={{ top: '100%', left: '50%', cursor: 'ns-resize' }}
                  onMouseDown={(e) => startHandleDrag('s', e)}
                />
                {/* SW */}
                <div
                  className="canvas-handle"
                  style={{ top: '100%', left: 0, cursor: 'nesw-resize' }}
                  onMouseDown={(e) => startHandleDrag('sw', e)}
                />
                {/* W */}
                <div
                  className="canvas-handle"
                  style={{ top: '50%', left: 0, cursor: 'ew-resize' }}
                  onMouseDown={(e) => startHandleDrag('w', e)}
                />
              </>
            )}
          </div>
        )}

        {/* Inline Double-Click Text Editor Overlay */}
        {editingNodeId && primarySelectedNode && (
          <textarea
            autoFocus
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={handleTextEditCommit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditingNodeId(null);
              }
            }}
            style={{
              position: 'absolute',
              left: `${primarySelectedNode.x}px`,
              top: `${primarySelectedNode.y}px`,
              width: `${Math.max(primarySelectedNode.width, 120)}px`,
              height: `${Math.max(primarySelectedNode.height, 40)}px`,
              fontFamily: primarySelectedNode.fontFamily || 'Inter, sans-serif',
              fontSize: `${primarySelectedNode.fontSize || 14}px`,
              fontWeight: primarySelectedNode.fontWeight || 400,
              color: primarySelectedNode.color || '#FFFFFF',
              background: 'rgba(8, 7, 10, 0.95)',
              border: '1px solid var(--gold-antique)',
              borderRadius: '4px',
              padding: '2px 4px',
              resize: 'both',
              zIndex: 50,
              outline: 'none',
              boxShadow: '0 0 16px rgba(212, 175, 55, 0.5)'
            }}
          />
        )}
      </div>
    </div>
  );
};
