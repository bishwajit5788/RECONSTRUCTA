/**
 * RECONSTRUCTA — BEFORE / AFTER COMPARISON SLIDER
 * Interactive draggable golden divider comparing original image vs edited scene graph.
 */

import React, { useRef, useState, MouseEvent } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { Columns, SplitSquareVertical } from 'lucide-react';

interface BeforeAfterSplitProps {
  originalImageUrl?: string;
}

export const BeforeAfterSplit: React.FC<BeforeAfterSplitProps> = ({ originalImageUrl }) => {
  const { splitPosition, setSplitPosition, sceneGraph, zoom, panX, panY } = useEditorStore();
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newPos = (e.clientX - rect.left) / rect.width;
    setSplitPosition(newPos);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const splitPercentage = `${splitPosition * 100}%`;

  return (
    <div
      ref={containerRef}
      className="canvas-viewport-container"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ userSelect: 'none' }}
    >
      {/* Original Image Layer (Left side) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: splitPercentage,
          overflow: 'hidden',
          zIndex: 10,
          borderRight: '1px solid rgba(212, 175, 55, 0.4)'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${panX}px`,
            top: `${panY}px`,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          {originalImageUrl ? (
            <img
              src={originalImageUrl}
              alt="Original visual"
              style={{
                width: `${sceneGraph.canvasWidth}px`,
                height: `${sceneGraph.canvasHeight}px`,
                display: 'block'
              }}
            />
          ) : (
            <div
              style={{
                width: `${sceneGraph.canvasWidth}px`,
                height: `${sceneGraph.canvasHeight}px`,
                background: '#0F0C13',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9D96A5'
              }}
            >
              Original Source
            </div>
          )}
        </div>

        {/* Badge */}
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            background: 'rgba(8, 7, 10, 0.85)',
            border: '1px solid var(--border-gold-subtle)',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: 'var(--gold-antique)'
          }}
        >
          ORIGINAL
        </div>
      </div>

      {/* Edited Scene Graph Layer (Right side full bleed under mask) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 5
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${panX}px`,
            top: `${panY}px`,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          <div
            style={{
              width: `${sceneGraph.canvasWidth}px`,
              height: `${sceneGraph.canvasHeight}px`,
              background: sceneGraph.backgroundColor || '#08070A',
              position: 'relative'
            }}
          >
            {Object.values(sceneGraph.nodes)
              .filter((n) => n.visible)
              .map((node) => (
                <div
                  key={node.id}
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    height: `${node.height}px`,
                    backgroundColor: node.backgroundColor,
                    borderRadius: `${node.borderRadius || 0}px`,
                    color: node.color || '#FFFFFF',
                    fontFamily: node.fontFamily || 'Inter, sans-serif',
                    fontSize: `${node.fontSize || 14}px`,
                    fontWeight: node.fontWeight || 400
                  }}
                >
                  {node.content}
                </div>
              ))}
          </div>
        </div>

        {/* Badge */}
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'rgba(8, 7, 10, 0.85)',
            border: '1px solid var(--border-gold-subtle)',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            color: 'var(--gold-light)'
          }}
        >
          EDITED / RECONSTRUCTED
        </div>
      </div>

      {/* Interactive Draggable Split Divider Line & Handle */}
      <div
        className="before-after-divider"
        style={{ left: splitPercentage }}
        onMouseDown={handleMouseDown}
      >
        <div className="before-after-handle">
          <SplitSquareVertical size={16} />
        </div>
      </div>
    </div>
  );
};
