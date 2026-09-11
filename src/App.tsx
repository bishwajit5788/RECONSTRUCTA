import { useMemo, useRef, useState } from 'react'
import { Upload, FileImage, Type, Layers3, Settings2, Sparkles, Eye, ZoomIn, ZoomOut, Undo2, Redo2, Download, MousePointer2, Box, ScanText, Wand2, ChevronRight } from 'lucide-react'
import './App.css'

type Layer = { id: string; name: string; type: string; visible: boolean }

const initialLayers: Layer[] = [
  { id: 'title', name: 'Headline', type: 'Text', visible: true },
  { id: 'body', name: 'Body copy', type: 'Text', visible: true },
  { id: 'accent', name: 'Accent shape', type: 'Vector', visible: true },
  { id: 'background', name: 'Background', type: 'Image', visible: true },
]

export function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [layers, setLayers] = useState(initialLayers)
  const [selected, setSelected] = useState('title')
  const [zoom, setZoom] = useState(100)
  const [fileName, setFileName] = useState('Untitled reconstruction')
  const [status, setStatus] = useState('Ready')

  const selectedLayer = useMemo(() => layers.find((l) => l.id === selected), [layers, selected])

  const importFile = (file?: File) => {
    if (!file) return
    setFileName(file.name.replace(/\.[^.]+$/, ''))
    setStatus(`Imported ${file.name}`)
  }

  const toggleLayer = (id: string) => {
    setLayers((items) => items.map((l) => l.id === id ? { ...l, visible: !l.visible } : l))
  }

  return (
    <div className="reconstructa-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div><div className="brand-name">RECONSTRUCTA</div><div className="brand-sub">Universal Visual & Document Editor</div></div>
        </div>
        <div className="document-name">{fileName}<span className="saved-dot">●</span></div>
        <div className="top-actions">
          <span className="mode-pill"><span /> LOCAL MODE</span>
          <button className="icon-btn" title="Undo"><Undo2 size={16}/></button>
          <button className="icon-btn" title="Redo"><Redo2 size={16}/></button>
          <button className="gold-btn"><Download size={15}/> Export</button>
        </div>
      </header>

      <main className="workspace">
        <aside className="leftbar">
          <button className="import-card" onClick={() => inputRef.current?.click()}>
            <Upload size={20}/><strong>Import & Reconstruct</strong><span>Image · PDF · EML · DOCX · PPTX</span>
          </button>
          <input ref={inputRef} hidden type="file" accept="image/*,.pdf,.eml,.docx,.pptx" onChange={(e) => importFile(e.target.files?.[0])}/>
          <div className="section-label">TOOLS</div>
          <Tool icon={<MousePointer2/>} label="Select" active />
          <Tool icon={<Box/>} label="Elements" />
          <Tool icon={<Type/>} label="Typography" />
          <Tool icon={<ScanText/>} label="OCR & Text" />
          <Tool icon={<Wand2/>} label="Inpainting" />
          <Tool icon={<Sparkles/>} label="Reconstruct" />
          <div className="left-spacer" />
          <div className="privacy-card"><Eye size={15}/><div><b>Provenance on</b><span>Edited / mockup exports stay traceable.</span></div></div>
        </aside>

        <section className="editor">
          <div className="editor-toolbar">
            <div className="crumb"><FileImage size={14}/> Canvas <ChevronRight size={13}/> {fileName}</div>
            <div className="canvas-tools"><button className="tool-square" onClick={() => setZoom(Math.max(25, zoom - 10))}><ZoomOut size={15}/></button><span>{zoom}%</span><button className="tool-square" onClick={() => setZoom(Math.min(400, zoom + 10))}><ZoomIn size={15}/></button><span className="divider"/><button className="tool-square"><Settings2 size={15}/></button></div>
          </div>
          <div className="canvas-area">
            <div className="ruler horizontal"><span>0</span><span>200</span><span>400</span><span>600</span><span>800</span></div>
            <div className="artboard-wrap" style={{ transform: `scale(${zoom / 100})` }}>
              <div className="artboard">
                <div className="mockup-topline">RECONSTRUCTA / VISUAL STUDY</div>
                <div className="mockup-accent" />
                <div className={`mockup-title ${selected === 'title' ? 'selected-layer' : ''}`} onClick={() => setSelected('title')}>Turn flat content<br/><em>into editable layers.</em></div>
                <div className={`mockup-body ${selected === 'body' ? 'selected-layer' : ''}`} onClick={() => setSelected('body')}>Reconstruct layouts, typography and visual structure<br/>without losing the original design language.</div>
                <div className="mockup-chip">HIGH FIDELITY · NON-DESTRUCTIVE</div>
                <div className="mockup-footer">EDITED / MOCKUP <span>•</span> RECONSTRUCTA</div>
              </div>
            </div>
            <div className="canvas-status"><span>{status}</span><span>Snap: ON · Grid: 8px · 16 MP limit</span></div>
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector-tabs"><button className="active">LAYERS</button><button>INSPECT</button><button>ASSETS</button></div>
          <div className="panel-heading"><div><small>SCENE GRAPH</small><h3>Editable layers</h3></div><Layers3 size={17}/></div>
          <div className="layer-list">{layers.map((layer) => <div key={layer.id} className={`layer ${selected === layer.id ? 'active' : ''}`} onClick={() => setSelected(layer.id)}><button className="visibility" onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id) }}>{layer.visible ? <Eye size={14}/> : <span className="hidden-eye">—</span>}</button><div className="layer-icon">{layer.type === 'Text' ? <Type size={14}/> : <Box size={14}/>}</div><div className="layer-copy"><b>{layer.name}</b><span>{layer.type}</span></div></div>)}</div>
          <div className="inspector-divider"/>
          <div className="properties"><div className="panel-heading"><div><small>SELECTION</small><h3>{selectedLayer?.name || 'None'}</h3></div></div><Field label="Position" value="X  420   Y  286"/><Field label="Size" value="W  520   H  148"/><Field label="Opacity" value="100%"/><div className="confidence"><div><span>RECONSTRUCTION CONFIDENCE</span><b>94%</b></div><div className="confidence-track"><i style={{width:'94%'}}/></div><small>Evidence-backed geometry · OCR text · style analysis</small></div></div>
          <button className="reconstruct-btn"><Sparkles size={16}/> Run reconstruction audit</button>
        </aside>
      </main>
      <footer className="statusbar"><span><b>RECONSTRUCTA</b> · Local-first workspace</span><span>Scene graph 4 layers · {selectedLayer?.name || 'No selection'} · v0.1 demo</span></footer>
    </div>
  )
}

function Tool({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return <button className={`tool-item ${active ? 'active' : ''}`}>{icon}<span>{label}</span></button>
}
function Field({ label, value }: { label: string; value: string }) {
  return <div className="field"><span>{label}</span><div>{value}</div></div>
}
