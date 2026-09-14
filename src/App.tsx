import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Upload, FileImage, Type, Layers3, Settings2, Sparkles, Eye, ZoomIn, ZoomOut, Undo2, Redo2, Download, MousePointer2, Box, ScanText, Wand2, ChevronRight, ShieldCheck, LogIn, UserPlus, LogOut, Trash2, ChevronUp, ChevronDown, RotateCw } from 'lucide-react'
import './App.css'

type Layer = {
  id: string; name: string; type: 'Text' | 'Image' | 'Document' | 'Vector'; visible: boolean
  x: number; y: number; width: number; height: number; rotation: number; opacity: number
  text?: string; fontSize?: number; fontFamily?: string; src?: string; assetId?: string
}
type Snapshot = { layers: Layer[]; selected: string | null }
const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const TOKEN_KEY = 'reconstructa_access_token'
const PROJECT_KEY = 'reconstructa_project_id'

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<{user_id:string; username:string} | null>(null)
  const [authMode, setAuthMode] = useState<'login'|'register'>('login')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [layers, setLayers] = useState<Layer[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [fileName, setFileName] = useState('Untitled reconstruction')
  const [status, setStatus] = useState('Ready')
  const [draggingImport, setDraggingImport] = useState(false)
  const [projectId, setProjectId] = useState(() => localStorage.getItem(PROJECT_KEY) || crypto.randomUUID())
  const [history, setHistory] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{id:string; mode:'move'|'resize'|'rotate'; sx:number; sy:number; ox:number; oy:number; ow:number; oh:number; or:number} | null>(null)

  const selectedLayer = useMemo(() => layers.find(l => l.id === selected), [layers, selected])
  const authFetch = useCallback(async (path:string, init:RequestInit = {}) => {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(`${API}${path}`, {...init, headers})
  }, [token])

  const loadMe = useCallback(async () => {
    if (!token) return
    const r = await authFetch('/api/auth/me')
    if (!r.ok) { localStorage.removeItem(TOKEN_KEY); setToken(null); return }
    setUser(await r.json())
  }, [authFetch, token])
  useEffect(() => { void loadMe() }, [loadMe])

  const authenticate = async (e:React.FormEvent) => {
    e.preventDefault(); setAuthBusy(true); setAuthError('')
    try {
      const r = await fetch(`${API}/api/auth/${authMode}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:username.trim(), password})})
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.detail || 'Authentication failed')
      localStorage.setItem(TOKEN_KEY, data.access_token); setToken(data.access_token); setUser({user_id:data.user_id, username:data.username}); setPassword('')
    } catch (err) { setAuthError(err instanceof Error ? err.message : 'Authentication failed') } finally { setAuthBusy(false) }
  }

  const logout = async () => { try { if (token) await authFetch('/api/auth/logout', {method:'POST'}) } finally { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(PROJECT_KEY); setToken(null); setUser(null); setLayers([]); setSelected(null) } }

  const commit = (next:Layer[], nextSelected=selected) => {
    setHistory(h => [...h.slice(-49), {layers, selected}]); setFuture([]); setLayers(next); setSelected(nextSelected)
  }
  const updateLayer = (id:string, patch:Partial<Layer>, save=true) => {
    const next = layers.map(l => l.id === id ? {...l, ...patch} : l)
    if (save) commit(next, selected); else setLayers(next)
  }
  const undo = () => { const last=history.at(-1); if(!last) return; setFuture(f=>[...f.slice(-49),{layers,selected}]); setLayers(last.layers); setSelected(last.selected); setHistory(h=>h.slice(0,-1)) }
  const redo = () => { const next=future.at(-1); if(!next) return; setHistory(h=>[...h.slice(-49),{layers,selected}]); setLayers(next.layers); setSelected(next.selected); setFuture(f=>f.slice(0,-1)) }

  const ensureProject = useCallback(async (name:string) => {
    const r = await authFetch('/api/projects', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({project_id:projectId,name,canvas_width:1080,canvas_height:720,node_count:layers.length})})
    if (!r.ok) throw new Error((await r.json().catch(()=>({}))).detail || 'Project creation failed')
    localStorage.setItem(PROJECT_KEY, projectId)
  }, [authFetch, projectId, layers.length])

  const importFile = async (file?:File) => {
    if (!file || !token) return
    if (!/\.(png|jpe?g|webp|pdf|eml|docx|pptx)$/i.test(file.name)) { setStatus('Unsupported file type'); return }
    setStatus(`Uploading ${file.name}…`)
    try {
      await ensureProject(file.name.replace(/\.[^.]+$/, ''))
      const form = new FormData(); form.append('file', file); form.append('project_id', projectId); form.append('purpose','uploads')
      const r = await authFetch('/api/files/upload', {method:'POST', body:form})
      const data = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(data.detail || 'Upload failed')
      const blob = await (await authFetch(`/api/files/${data.object_id}`)).blob()
      const src = URL.createObjectURL(blob)
      const isImage = file.type.startsWith('image/')
      const layer:Layer = {id:crypto.randomUUID(), name:file.name, type:isImage?'Image':'Document', visible:true, x:0,y:0,width:1080,height:720,rotation:0,opacity:100,src,assetId:data.object_id}
      const img = isImage ? new Image() : null
      if (img) await new Promise<void>(resolve => { img.onload=()=>resolve(); img.onerror=()=>resolve(); img.src=src })
      const ratio = img?.naturalWidth && img?.naturalHeight ? img.naturalWidth/img.naturalHeight : 1.5
      layer.height = Math.min(720, 1080/ratio); layer.y = (720-layer.height)/2
      commit([layer], layer.id); setFileName(file.name.replace(/\.[^.]+$/, '')); setStatus(`Imported ${file.name}`)
    } catch (err) { setStatus(err instanceof Error ? err.message : 'Import failed') }
  }

  const addText = () => { const id=crypto.randomUUID(); const layer:Layer={id,name:'Text layer',type:'Text',visible:true,x:120,y:100,width:500,height:90,rotation:0,opacity:100,text:'Double-click to edit',fontSize:48,fontFamily:'Inter'}; commit([...layers,layer],id) }
  const deleteSelected = () => { if(!selected) return; const next=layers.filter(l=>l.id!==selected); commit(next,next.at(-1)?.id||null) }
  const moveLayer = (direction:number) => { if(!selected) return; const i=layers.findIndex(l=>l.id===selected); const j=i+direction; if(i<0||j<0||j>=layers.length)return; const next=[...layers]; [next[i],next[j]]=[next[j],next[i]]; commit(next,selected) }
  const pointerStart = (e:React.PointerEvent, id:string, mode:'move'|'resize'|'rotate') => { e.stopPropagation(); const l=layers.find(x=>x.id===id); if(!l||!boardRef.current)return; setSelected(id); dragRef.current={id,mode,sx:e.clientX,sy:e.clientY,ox:l.x,oy:l.y,ow:l.width,oh:l.height,or:l.rotation}; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
  const pointerMove = (e:React.PointerEvent) => { const d=dragRef.current;if(!d)return; const scale=zoom/100; const dx=(e.clientX-d.sx)/scale, dy=(e.clientY-d.sy)/scale; const l=layers.find(x=>x.id===d.id);if(!l)return; if(d.mode==='move') updateLayer(d.id,{x:Math.max(0,d.ox+dx),y:Math.max(0,d.oy+dy)},false); if(d.mode==='resize') updateLayer(d.id,{width:Math.max(20,d.ow+dx),height:Math.max(20,d.oh+dy)},false); if(d.mode==='rotate') updateLayer(d.id,{rotation:d.or+dx},false) }
  const pointerEnd = () => { if(dragRef.current){ const l=layers.find(x=>x.id===dragRef.current!.id); if(l) commit(layers,l.id); dragRef.current=null } }

  const exportScene = async () => {
    if(!layers.length){setStatus('Nothing to export');return}
    const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    const body=layers.filter(l=>l.visible).map(l=>l.type==='Text'?`<text x="${l.x}" y="${l.y+l.height*.65}" font-family="${esc(l.fontFamily||'Inter')}" font-size="${l.fontSize||32}" opacity="${l.opacity/100}" transform="rotate(${l.rotation} ${l.x+l.width/2} ${l.y+l.height/2})">${esc(l.text||'')}</text>`:l.src?`<image href="${l.src}" x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" opacity="${l.opacity/100}" preserveAspectRatio="xMidYMid meet" transform="rotate(${l.rotation} ${l.x+l.width/2} ${l.y+l.height/2})"/>`:'').join('')
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="720" viewBox="0 0 1080 720"><rect width="1080" height="720" fill="#111"/>${body}<text x="24" y="696" font-size="12" fill="#aaa">EDITED / MOCKUP • RECONSTRUCTA</text></svg>`
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));a.download=`${fileName || 'reconstructa'}.svg`;a.click();URL.revokeObjectURL(a.href);setStatus('Exported SVG')
  }

  useEffect(() => { if(!token || !layers.length) return; const t=setTimeout(()=>{ void authFetch(`/api/projects/${projectId}/touch`,{method:'POST'}); void authFetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:projectId,name:fileName,canvas_width:1080,canvas_height:720,node_count:layers.length})}) ; setStatus('Autosaved') },900); return()=>clearTimeout(t) }, [layers,fileName,projectId,token,authFetch])

  if (!token || !user) return <AuthScreen mode={authMode} setMode={setAuthMode} username={username} setUsername={setUsername} password={password} setPassword={setPassword} error={authError} busy={authBusy} onSubmit={authenticate}/>

  return <div className="reconstructa-shell" onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();undo()} if((e.metaKey||e.ctrlKey)&&e.key==='y'){e.preventDefault();redo()}}} tabIndex={0}>
    <header className="topbar"><div className="brand"><div className="brand-mark">R</div><div><div className="brand-name">RECONSTRUCTA</div><div className="brand-sub">Universal Visual & Document Editor</div></div></div><div className="document-name">{fileName}<span className="saved-dot">●</span></div><div className="top-actions"><span className="mode-pill"><span/> AUTHENTICATED</span><span className="user-pill">{user.username}</span><button className="icon-btn" title="Undo" onClick={undo} disabled={!history.length}><Undo2 size={16}/></button><button className="icon-btn" title="Redo" onClick={redo} disabled={!future.length}><Redo2 size={16}/></button><button className="gold-btn" onClick={()=>void exportScene()}><Download size={15}/> Export</button><button className="icon-btn" title="Logout" onClick={()=>void logout()}><LogOut size={16}/></button></div></header>
    <main className="workspace"><aside className="leftbar"><button className={`import-card ${draggingImport?'dragging':''}`} onClick={()=>inputRef.current?.click()} onDragOver={e=>{e.preventDefault();setDraggingImport(true)}} onDragLeave={()=>setDraggingImport(false)} onDrop={e=>{e.preventDefault();setDraggingImport(false);void importFile(e.dataTransfer.files?.[0])}}><Upload size={20}/><strong>{draggingImport?'Drop to import':'Import & Reconstruct'}</strong><span>Image · PDF · EML · DOCX · PPTX</span></button><input ref={inputRef} hidden type="file" accept="image/*,.pdf,.eml,.docx,.pptx" onChange={e=>{void importFile(e.target.files?.[0]);e.currentTarget.value=''}}/><div className="section-label">TOOLS</div><Tool icon={<MousePointer2/>} label="Select" active/><Tool icon={<Box/>} label="Elements"/><button className="tool-item" onClick={addText}><Type/><span>Typography</span></button><Tool icon={<ScanText/>} label="OCR & Text"/><Tool icon={<Wand2/>} label="Inpainting"/><Tool icon={<Sparkles/>} label="Reconstruct"/><div className="left-spacer"/><div className="privacy-card"><ShieldCheck size={15}/><div><b>Provenance on</b><span>Exports remain traceable.</span></div></div></aside>
    <section className="editor"><div className="editor-toolbar"><div className="crumb"><FileImage size={14}/> Canvas <ChevronRight size={13}/> {fileName}</div><div className="canvas-tools"><button className="tool-square" onClick={()=>setZoom(Math.max(25,zoom-10))}><ZoomOut size={15}/></button><span>{zoom}%</span><button className="tool-square" onClick={()=>setZoom(Math.min(400,zoom+10))}><ZoomIn size={15}/></button><span className="divider"/><button className="tool-square"><Settings2 size={15}/></button></div></div><div className="canvas-area" onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}><div className="ruler horizontal"><span>0</span><span>200</span><span>400</span><span>600</span><span>800</span><span>1080</span></div><div className="artboard-wrap" style={{transform:`scale(${zoom/100})`}}><div className="artboard" ref={boardRef} onPointerDown={()=>setSelected(null)}>{layers.map(l=>l.visible&&<LayerView key={l.id} layer={l} selected={selected===l.id} onSelect={()=>setSelected(l.id)} onPointerStart={pointerStart} onText={(text)=>updateLayer(l.id,{text})}/>)}{!layers.length&&<div className="empty-canvas"><Sparkles size={30}/><b>Import a file to start editing</b><span>Or add a text layer from Typography.</span></div>}</div></div><div className="canvas-status"><span>{status}</span><span>Snap: ON · Grid: 8px · {layers.length} layers</span></div></div></section>
    <aside className="inspector"><div className="inspector-tabs"><button className="active">LAYERS</button><button>INSPECT</button><button>ASSETS</button></div><div className="panel-heading"><div><small>SCENE GRAPH</small><h3>Editable layers</h3></div><Layers3 size={17}/></div><div className="layer-list">{[...layers].reverse().map(layer=><div key={layer.id} className={`layer ${selected===layer.id?'active':''}`} onClick={()=>setSelected(layer.id)}><button className="visibility" onClick={e=>{e.stopPropagation();updateLayer(layer.id,{visible:!layer.visible})}}>{layer.visible?<Eye size={14}/>:<span>—</span>}</button><div className="layer-icon">{layer.type==='Text'?<Type size={14}/>:<Box size={14}/>}</div><div className="layer-copy"><b>{layer.name}</b><span>{layer.type}</span></div></div>)}</div><div className="inspector-divider"/>{selectedLayer?<div className="properties"><div className="panel-heading"><div><small>SELECTION</small><h3>{selectedLayer.name}</h3></div></div><PropertyInput label="X" value={selectedLayer.x} onChange={v=>updateLayer(selectedLayer.id,{x:v})}/><PropertyInput label="Y" value={selectedLayer.y} onChange={v=>updateLayer(selectedLayer.id,{y:v})}/><PropertyInput label="W" value={selectedLayer.width} onChange={v=>updateLayer(selectedLayer.id,{width:Math.max(20,v)})}/><PropertyInput label="H" value={selectedLayer.height} onChange={v=>updateLayer(selectedLayer.id,{height:Math.max(20,v)})}/><PropertyInput label="Rotation" value={Math.round(selectedLayer.rotation)} onChange={v=>updateLayer(selectedLayer.id,{rotation:v})}/><PropertyInput label="Opacity" value={selectedLayer.opacity} onChange={v=>updateLayer(selectedLayer.id,{opacity:Math.max(0,Math.min(100,v))})}/>{selectedLayer.type==='Text'&&<><label className="text-property">Text<textarea value={selectedLayer.text||''} onChange={e=>updateLayer(selectedLayer.id,{text:e.target.value},false)} onBlur={()=>commit(layers,selectedLayer.id)}/></label><PropertyInput label="Font size" value={selectedLayer.fontSize||32} onChange={v=>updateLayer(selectedLayer.id,{fontSize:Math.max(8,v)})}/><label className="text-property">Font<select value={selectedLayer.fontFamily||'Inter'} onChange={e=>updateLayer(selectedLayer.id,{fontFamily:e.target.value})}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>monospace</option></select></label></>}</div>:<div className="no-selection">Select a layer to edit its properties.</div>}<div className="layer-actions"><button onClick={()=>moveLayer(1)} disabled={!selected}><ChevronDown size={14}/> Down</button><button onClick={()=>moveLayer(-1)} disabled={!selected}><ChevronUp size={14}/> Up</button><button onClick={deleteSelected} disabled={!selected}><Trash2 size={14}/></button><button onClick={()=>selectedLayer&&updateLayer(selectedLayer.id,{rotation:selectedLayer.rotation+15})} disabled={!selected}><RotateCw size={14}/></button></div><button className="reconstruct-btn" onClick={()=>setStatus('Reconstruction audit queued for the selected scene')}><Sparkles size={16}/> Run reconstruction audit</button></aside></main><footer className="statusbar"><span><b>RECONSTRUCTA</b> · Authenticated workspace</span><span>Scene graph {layers.length} layers · {selectedLayer?.name||'No selection'} · Autosave ON</span></footer></div>
}

function LayerView({layer,selected,onSelect,onPointerStart,onText}:{layer:Layer;selected:boolean;onSelect:()=>void;onPointerStart:(e:React.PointerEvent,id:string,mode:'move'|'resize'|'rotate')=>void;onText:(text:string)=>void}){return <div className={`scene-layer ${selected?'selected-layer':''}`} style={{left:layer.x,top:layer.y,width:layer.width,height:layer.height,opacity:layer.opacity/100,transform:`rotate(${layer.rotation}deg)`}} onPointerDown={e=>onPointerStart(e,layer.id,'move')} onClick={e=>{e.stopPropagation();onSelect()}}>{layer.type==='Text'?<div className="editable-text" contentEditable suppressContentEditableWarning onBlur={e=>onText(e.currentTarget.textContent||'')}>{layer.text}</div>:layer.src?<img src={layer.src} alt={layer.name} draggable={false}/>:<div className="document-preview"><FileImage size={32}/><b>{layer.name}</b><span>{layer.type} imported asset</span></div>}{selected&&<><div className="resize-handle" onPointerDown={e=>{e.stopPropagation();onPointerStart(e,layer.id,'resize')}}/><div className="rotate-handle" onPointerDown={e=>{e.stopPropagation();onPointerStart(e,layer.id,'rotate')}}/></>}</div>}
function PropertyInput({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}){return <label className="property-input"><span>{label}</span><input type="number" value={Number.isFinite(value)?value:0} onChange={e=>onChange(Number(e.target.value)||0)}/></label>}
function Tool({icon,label,active=false}:{icon:React.ReactNode;label:string;active?:boolean}){return <button className={`tool-item ${active?'active':''}`}>{icon}<span>{label}</span></button>}
function AuthScreen({mode,setMode,username,setUsername,password,setPassword,error,busy,onSubmit}:{mode:'login'|'register';setMode:(m:'login'|'register')=>void;username:string;setUsername:(v:string)=>void;password:string;setPassword:(v:string)=>void;error:string;busy:boolean;onSubmit:(e:React.FormEvent)=>void}){return <div className="auth-shell"><div className="auth-card"><div className="brand"><div className="brand-mark">R</div><div><div className="brand-name">RECONSTRUCTA</div><div className="brand-sub">Universal Visual & Document Editor</div></div></div><div className="auth-heading"><small>SECURE WORKSPACE</small><h1>{mode==='login'?'Welcome back':'Create your workspace'}</h1><p>Sign in to create and edit your private reconstruction projects.</p></div><form onSubmit={onSubmit}><label>Username<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={64} required/></label><label>Password<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={12} maxLength={256} required/></label>{mode==='register'&&<small className="password-hint">Use at least 12 characters.</small>}{error&&<div className="auth-error">{error}</div>}<button className="gold-btn auth-submit" disabled={busy}>{mode==='login'?<LogIn size={16}/>:<UserPlus size={16}/>} {busy?'Working…':mode==='login'?'Sign in':'Register'}</button></form><button className="auth-switch" onClick={()=>{setMode(mode==='login'?'register':'login');}}>{mode==='login'?'Need an account? Register':'Already registered? Sign in'}</button></div></div>}
