import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { SceneNode } from '../../types/sceneGraph';

/**
 * RECONSTRUCTA document viewport.
 *
 * Important rendering rule: imported documents are real visual backgrounds.
 * PDF.js produces a raster page plus editable text nodes; the old viewport only
 * painted the text nodes, which made a PDF look like a black/empty canvas.
 * This viewport paints originalImageUrl/background src first, then editable nodes.
 */
export const CanvasViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const fittedDocumentKeyRef = useRef<string>('');
  const userAdjustedViewRef = useRef(false);
  const [imageRevision, setImageRevision] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; node?: SceneNode; panX: number; panY: number } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

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
    setZoom,
    setPan,
    setSelectedNodes,
    updateNode,
  } = useEditorStore();

  const { pushState } = useHistoryStore();
  const primarySelectedNode = selectedNodeIds.length === 1 ? sceneGraph.nodes[selectedNodeIds[0]] : null;
  const ruler = showRulers ? 24 : 0;

  const clampZoom = (value: number) => Math.max(0.1, Math.min(8, value));

  const fitDocument = useCallback(() => {
    const container = containerRef.current;
    if (!container || !sceneGraph.canvasWidth || !sceneGraph.canvasHeight) return;

    const width = Math.max(240, container.clientWidth - 32 - ruler);
    const height = Math.max(240, container.clientHeight - 32 - ruler);
    const fittedZoom = Math.min(width / sceneGraph.canvasWidth, height / sceneGraph.canvasHeight, 1);
    const safeZoom = clampZoom(fittedZoom || 0.5);

    setZoom(safeZoom);
    setPan(
      ruler + Math.max(16, (width - sceneGraph.canvasWidth * safeZoom) / 2),
      ruler + Math.max(16, (height - sceneGraph.canvasHeight * safeZoom) / 2),
    );
  }, [sceneGraph.canvasWidth, sceneGraph.canvasHeight, ruler, setPan, setZoom]);

  // Fit every newly imported document once. This prevents a full-size browser
  // viewport from inheriting a stale zoom/pan from another document.
  useEffect(() => {
    const key = `${sceneGraph.canvasWidth}x${sceneGraph.canvasHeight}:${sceneGraph.originalImageUrl?.slice(0, 48) || ''}`;
    if (!key.startsWith('0x0') && fittedDocumentKeyRef.current !== key) {
      fittedDocumentKeyRef.current = key;
      userAdjustedViewRef.current = false;
      requestAnimationFrame(() => fitDocument());
    }
  }, [sceneGraph.canvasWidth, sceneGraph.canvasHeight, sceneGraph.originalImageUrl, fitDocument]);

  // Re-fit only while the user has not manually changed the view. This keeps
  // maximize/minimize and browser resizing stable without fighting manual zoom.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (!userAdjustedViewRef.current) requestAnimationFrame(() => fitDocument());
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitDocument]);

  const getImage = useCallback((src: string) => {
    const cached = imageCacheRef.current.get(src);
    if (cached) return cached;

    const image = new Image();
    image.onload = () => setImageRevision((value) => value + 1);
    image.onerror = () => setImageRevision((value) => value + 1);
    image.src = src;
    imageCacheRef.current.set(src, image);
    return image;
  }, []);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { canvasWidth, canvasHeight, backgroundColor, nodes } = sceneGraph;
    if (!canvasWidth || !canvasHeight) return;

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = backgroundColor || '#08070A';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Paint the actual imported document before editable overlays.
    const backgroundNode = Object.values(nodes)
      .filter((node) => node.visible && node.src && (node.type === 'background' || node.zIndex <= 1))
      .sort((a, b) => a.zIndex - b.zIndex)[0];
    const backgroundSrc = backgroundNode?.src || sceneGraph.originalImageUrl || sceneGraph.backgroundImageUrl;
    if (backgroundSrc) {
      const image = getImage(backgroundSrc);
      if (image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight);
      }
    }

    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.07)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvasWidth; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasHeight); ctx.stroke();
      }
      for (let y = 0; y <= canvasHeight; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasWidth, y); ctx.stroke();
      }
      ctx.restore();
    }

    const sortedNodes = Object.values(nodes)
      .filter((node) => node.visible)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const node of sortedNodes) {
      // The flattened document background has already been painted above.
      if (node.id === backgroundNode?.id || node.type === 'background') continue;

      ctx.save();
      ctx.globalAlpha = node.opacity ?? 1;
      if (node.rotation) {
        ctx.translate(node.x + node.width / 2, node.y + node.height / 2);
        ctx.rotate((node.rotation * Math.PI) / 180);
        ctx.translate(-(node.x + node.width / 2), -(node.y + node.height / 2));
      }

      if (node.src) {
        const image = getImage(node.src);
        if (image.complete && image.naturalWidth > 0) {
          ctx.drawImage(image, node.x, node.y, node.width, node.height);
        }
      }

      if (node.backgroundColor || node.strokeColor) {
        const radius = node.borderRadius || 6;
        ctx.beginPath();
        ctx.roundRect(node.x, node.y, node.width, node.height, radius);
        if (node.backgroundColor) {
          ctx.fillStyle = node.backgroundColor;
          ctx.fill();
        }
        if (node.strokeColor) {
          ctx.strokeStyle = node.strokeColor;
          ctx.lineWidth = node.strokeWidth || 1;
          ctx.stroke();
        }
      }

      if (node.content && node.id !== editingNodeId) {
        const fontSize = node.fontSize || 14;
        const family = node.fontFamily || 'Inter, sans-serif';
        ctx.font = `${node.fontStyle || 'normal'} ${node.fontWeight || 400} ${fontSize}px ${family}`;
        ctx.fillStyle = node.color || '#FFFFFF';
        ctx.textBaseline = 'top';
        ctx.textAlign = node.alignment === 'center' ? 'center' : node.alignment === 'right' ? 'right' : 'left';

        const maxWidth = Math.max(node.width - 8, 20);
        const lineHeight = fontSize * (node.lineHeight || 1.25);
        const lines: string[] = [];
        for (const paragraph of node.content.split(/\r?\n/)) {
          if (!paragraph) { lines.push(''); continue; }
          let current = '';
          for (const word of paragraph.split(' ')) {
            const candidate = current ? `${current} ${word}` : word;
            if (current && ctx.measureText(candidate).width > maxWidth) {
              lines.push(current);
              current = word;
            } else current = candidate;
          }
          if (current) lines.push(current);
        }
        lines.forEach((line, index) => {
          const x = node.alignment === 'center' ? node.x + node.width / 2 : node.alignment === 'right' ? node.x + node.width - 4 : node.x + 4;
          ctx.fillText(line, x, node.y + 2 + index * lineHeight);
        });
      }
      ctx.restore();
    }
  }, [sceneGraph, showGrid, gridSize, editingNodeId, getImage, imageRevision]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const canvasPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    };
  };

  const nodeAtPoint = (x: number, y: number) => {
    return Object.values(sceneGraph.nodes)
      .filter((node) => node.visible)
      .sort((a, b) => b.zIndex - a.zIndex)
      .find((node) => x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height) || null;
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button === 1 || activeTool === 'pan') {
      userAdjustedViewRef.current = true;
      setIsPanning(true);
      setDragStart({ x: event.clientX, y: event.clientY, panX, panY });
      return;
    }
    if (event.button !== 0) return;

    const point = canvasPoint(event.clientX, event.clientY);
    const node = nodeAtPoint(point.x, point.y);
    if (!node) {
      setSelectedNodes([]);
      return;
    }
    setSelectedNodes(event.shiftKey ? [...selectedNodeIds.filter((id) => id !== node.id), node.id] : [node.id]);
    if (!node.locked) {
      pushState(sceneGraph);
      setDragStart({ x: event.clientX, y: event.clientY, panX: node.x, panY: node.y, node });
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    if (isPanning) {
      setPan(dragStart.panX + event.clientX - dragStart.x, dragStart.panY + event.clientY - dragStart.y);
      return;
    }
    if (!dragStart.node || dragStart.node.locked) return;
    const dx = (event.clientX - dragStart.x) / zoom;
    const dy = (event.clientY - dragStart.y) / zoom;
    updateNode(dragStart.node.id, { x: Math.round(dragStart.panX + dx), y: Math.round(dragStart.panY + dy) }, false);
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDragStart(null);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) {
      setPan(panX - event.deltaX, panY - event.deltaY);
      userAdjustedViewRef.current = true;
      return;
    }
    event.preventDefault();
    userAdjustedViewRef.current = true;
    const nextZoom = clampZoom(zoom * (event.deltaY < 0 ? 1.1 : 0.9));
    setZoom(nextZoom);
  };

  const startEditing = () => {
    if (!primarySelectedNode || primarySelectedNode.locked || primarySelectedNode.content === undefined) return;
    setEditingNodeId(primarySelectedNode.id);
    setEditingText(primarySelectedNode.content);
  };

  const commitEditing = () => {
    if (!editingNodeId) return;
    pushState(sceneGraph);
    updateNode(editingNodeId, { content: editingText }, true);
    setEditingNodeId(null);
  };

  return (
    <div
      ref={containerRef}
      className="canvas-viewport-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={startEditing}
      style={{ cursor: isPanning ? 'grabbing' : activeTool === 'pan' ? 'grab' : 'default' }}
    >
      <div className="document-viewport-toolbar" style={{
        position: 'absolute', top: 10, right: 12, zIndex: 100, display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 7px', borderRadius: 10, background: 'rgba(12,10,16,.92)', border: '1px solid rgba(212,175,55,.22)',
        boxShadow: '0 10px 30px rgba(0,0,0,.35)', backdropFilter: 'blur(12px)'
      }}>
        <button aria-label="Zoom out" className="tool-button" onClick={() => { userAdjustedViewRef.current = true; setZoom(clampZoom(zoom * 0.9)); }}><Minus size={14} /></button>
        <span style={{ minWidth: 52, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gold-light)' }}>{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in" className="tool-button" onClick={() => { userAdjustedViewRef.current = true; setZoom(clampZoom(zoom * 1.1)); }}><Plus size={14} /></button>
        <button aria-label="Fit document" className="tool-button" onClick={() => { userAdjustedViewRef.current = false; fitDocument(); }}><Maximize2 size={14} /></button>
        <button aria-label="Reset view" className="tool-button" onClick={() => { userAdjustedViewRef.current = false; fitDocument(); }}><RotateCcw size={14} /></button>
      </div>

      {showRulers && <>
        <div className="canvas-ruler-corner" />
        <div className="canvas-ruler-horizontal"><span style={{ paddingLeft: 8 }}>DOCUMENT</span></div>
        <div className="canvas-ruler-vertical"><span style={{ writingMode: 'vertical-rl', paddingTop: 8 }}>PAGE</span></div>
      </>}

      <div style={{
        position: 'absolute', left: panX, top: panY, width: sceneGraph.canvasWidth, height: sceneGraph.canvasHeight,
        transform: `scale(${zoom})`, transformOrigin: '0 0', background: '#fff',
        boxShadow: '0 18px 70px rgba(0,0,0,.62), 0 0 0 1px rgba(212,175,55,.22)', overflow: 'visible'
      }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: sceneGraph.canvasWidth, height: sceneGraph.canvasHeight }} />

        {selectedNodeIds.map((id) => {
          const node = sceneGraph.nodes[id];
          if (!node?.visible) return null;
          return <div key={id} className="canvas-selection-box" style={{ left: node.x, top: node.y, width: node.width, height: node.height, transform: `rotate(${node.rotation || 0}deg)`, transformOrigin: 'center center' }} />;
        })}

        {editingNodeId && primarySelectedNode && (
          <textarea
            autoFocus
            value={editingText}
            onChange={(event) => setEditingText(event.target.value)}
            onBlur={commitEditing}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditingNodeId(null);
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') commitEditing();
            }}
            style={{
              position: 'absolute', left: primarySelectedNode.x, top: primarySelectedNode.y,
              width: Math.max(primarySelectedNode.width, 120), height: Math.max(primarySelectedNode.height, 48),
              fontFamily: primarySelectedNode.fontFamily || 'Inter, sans-serif', fontSize: primarySelectedNode.fontSize || 14,
              fontWeight: primarySelectedNode.fontWeight || 400, color: primarySelectedNode.color || '#111',
              background: 'rgba(255,255,255,.97)', border: '1px solid var(--gold-antique)', borderRadius: 4,
              padding: 5, resize: 'both', zIndex: 120, outline: 'none', boxShadow: '0 0 18px rgba(212,175,55,.38)'
            }}
          />
        )}
      </div>

      {!sceneGraph.originalImageUrl && !sceneGraph.backgroundImageUrl && Object.keys(sceneGraph.nodes).length > 0 && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: 'var(--text-muted)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--gold-light)', fontSize: 18 }}>Editable document surface</div>
          <div style={{ marginTop: 6, fontSize: 12 }}>No flattened preview is available for this source.</div>
        </div>
      )}
    </div>
  );
};
