/**
 * RECONSTRUCTA — LEFT WORKSPACE SIDEBAR
 * Encapsulates Layer Tree, OCR / Review panel, and Asset manager.
 */

import React, { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { LayerTree } from './LayerTree';
import { OcrPanel } from './OcrPanel';
import { Layers, Scan } from 'lucide-react';

export const LeftSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'layers' | 'ocr' | 'assets'>('layers');
  const { isLeftDrawerOpen } = useEditorStore();

  return (
    <aside className={`left-panel ${isLeftDrawerOpen ? 'drawer-open' : ''}`}>
      {/* Tab Navigation */}
      <div className="panel-header-tabs">
        <button
          className={`panel-tab ${activeTab === 'layers' ? 'active' : ''}`}
          onClick={() => setActiveTab('layers')}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Layers size={13} /> Layers
          </span>
        </button>

        <button
          className={`panel-tab ${activeTab === 'ocr' ? 'active' : ''}`}
          onClick={() => setActiveTab('ocr')}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Scan size={13} /> OCR Review
          </span>
        </button>
      </div>

      {/* Panel Body */}
      <div className="panel-content">
        {activeTab === 'layers' && <LayerTree />}
        {activeTab === 'ocr' && <OcrPanel />}
      </div>
    </aside>
  );
};
