/**
 * RECONSTRUCTA — SLIDE & MULTI-PAGE PRESENTATION VIEWER
 * Provides thumbnail sidebar navigation, slide selection, reordering, and honest export mode reporting.
 */

import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { PptxSlideData, PptxParser } from '../../parsers/pptxParser';
import { ChevronLeft, ChevronRight, Presentation, AlertCircle } from 'lucide-react';

interface SlideViewerProps {
  slides: PptxSlideData[];
  currentSlideIndex: number;
  onSelectSlide: (index: number) => void;
  fidelityWarnings?: string[];
}

export const SlideViewer: React.FC<SlideViewerProps> = ({
  slides,
  currentSlideIndex,
  onSelectSlide,
  fidelityWarnings = []
}) => {
  const { setSceneGraph } = useEditorStore();
  const { pushState } = useHistoryStore();

  if (slides.length === 0) return null;

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      const targetIdx = currentSlideIndex - 1;
      onSelectSlide(targetIdx);
      const graph = PptxParser.buildSlideSceneGraph(slides[targetIdx]);
      setSceneGraph(graph);
      pushState(graph);
    }
  };

  const handleNext = () => {
    if (currentSlideIndex < slides.length - 1) {
      const targetIdx = currentSlideIndex + 1;
      onSelectSlide(targetIdx);
      const graph = PptxParser.buildSlideSceneGraph(slides[targetIdx]);
      setSceneGraph(graph);
      pushState(graph);
    }
  };

  const handleSelect = (idx: number) => {
    onSelectSlide(idx);
    const graph = PptxParser.buildSlideSceneGraph(slides[idx]);
    setSceneGraph(graph);
    pushState(graph);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--surface-dark)',
        borderRight: '1px solid var(--border-subtle)',
        width: 180,
        flexShrink: 0
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'var(--gold-light)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Presentation size={13} /> SLIDES ({slides.length})
        </span>
      </div>

      {/* Warnings notification */}
      {fidelityWarnings.length > 0 && (
        <div
          style={{
            padding: '6px 8px',
            margin: '8px 8px 0',
            background: 'rgba(218, 165, 32, 0.1)',
            border: '1px solid rgba(218, 165, 32, 0.3)',
            borderRadius: 4,
            fontSize: 10,
            color: 'var(--status-warning)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 4
          }}
          title={fidelityWarnings.join('\n')}
        >
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Partial fidelity export active</span>
        </div>
      )}

      {/* Thumbnail List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        {slides.map((slide, idx) => {
          const isActive = idx === currentSlideIndex;
          const textCount = slide.textNodes.length;
          const imgCount = slide.imageNodes.length;

          return (
            <div
              key={slide.slideNumber}
              onClick={() => handleSelect(idx)}
              style={{
                borderRadius: 4,
                border: isActive ? '1.5px solid var(--gold-antique)' : '1px solid var(--border-subtle)',
                background: isActive ? 'rgba(212, 175, 55, 0.08)' : 'var(--surface-base)',
                padding: '8px',
                cursor: 'pointer',
                transition: 'all 120ms ease'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    color: isActive ? 'var(--gold-bright)' : 'var(--text-muted)'
                  }}
                >
                  #{slide.slideNumber}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {textCount} text{textCount !== 1 ? 's' : ''}{imgCount > 0 ? ` • ${imgCount} img` : ''}
                </span>
              </div>

              {/* Mini visual mockup box */}
              <div
                style={{
                  width: '100%',
                  height: 60,
                  background: '#120F16',
                  borderRadius: 2,
                  border: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: 4
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    lineHeight: 1.2
                  }}
                >
                  {slide.textNodes[0]?.content?.slice(0, 24) || `Slide ${slide.slideNumber}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Controls */}
      <div
        style={{
          padding: '8px 10px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <button
          onClick={handlePrev}
          disabled={currentSlideIndex <= 0}
          style={{
            background: 'transparent',
            border: 'none',
            color: currentSlideIndex > 0 ? 'var(--gold-light)' : 'var(--text-muted)',
            cursor: currentSlideIndex > 0 ? 'pointer' : 'not-allowed',
            padding: 4
          }}
          title="Previous Slide"
        >
          <ChevronLeft size={16} />
        </button>

        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ivory)' }}>
          {currentSlideIndex + 1} / {slides.length}
        </span>

        <button
          onClick={handleNext}
          disabled={currentSlideIndex >= slides.length - 1}
          style={{
            background: 'transparent',
            border: 'none',
            color: currentSlideIndex < slides.length - 1 ? 'var(--gold-light)' : 'var(--text-muted)',
            cursor: currentSlideIndex < slides.length - 1 ? 'pointer' : 'not-allowed',
            padding: 4
          }}
          title="Next Slide"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
