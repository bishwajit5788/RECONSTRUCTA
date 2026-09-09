/**
 * RECONSTRUCTA — MAIN APPLICATION SHELL
 * Unified visual reconstruction workstation: file ingestion, vision/OCR pipeline,
 * canvas editing, reflow, and export.
 */

import React, { useState, useEffect } from 'react';
import { useEditorStore } from './store/useEditorStore';
import { useHistoryStore } from './store/useHistoryStore';
import { LuxuryHeader } from './components/header/LuxuryHeader';
import { LeftSidebar } from './components/leftPanel/LeftSidebar';
import { CanvasViewport } from './components/canvas/CanvasViewport';
import { BeforeAfterSplit } from './components/canvas/BeforeAfterSplit';
import { Inspector } from './components/rightPanel/Inspector';
import { ExportDialog } from './components/dialogs/ExportDialog';
import { CommandPalette } from './components/dialogs/CommandPalette';

import { FileDetector } from './parsers/fileDetector';
import { PDFParser } from './parsers/pdfParser';
import { EMLParser } from './parsers/emlParser';
import { DocxParser } from './parsers/docxParser';
import { OCRWorkerManager } from './engine/ocr/ocrWorker';
import { ObjectDetector } from './engine/vision/objectDetector';
import { SemanticClassifier } from './engine/vision/semanticClassifier';
import { FontDetector } from './engine/typography/fontDetector';
import { PlatformRegistry } from './engine/platforms/PlatformRegistry';
import { InpaintClient } from './engine/inpaint/inpaintClient';
import { ProjectStorage } from './engine/project/storage';

import { SceneGraph, SceneNode } from './types/sceneGraph';
import { ReconstructaProject } from './types/project';
import { UploadCloud, Sparkles } from 'lucide-react';
import { LuxuryButton } from './components/common/LuxuryButton';

export const App: React.FC = () => {
  const {
    sceneGraph,
    viewMode,
    isAnalyzing,
    statusMessage,
    setSceneGraph,
    setProject,
    setProcessing,
    setBackendConnected
  } = useEditorStore();

  const { pushState, undo, redo } = useHistoryStore();

  const [originalImageUrl, setOriginalImageUrl] = useState<string | undefined>();
  const [baseCanvas, setBaseCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Poll backend health every 10s
  useEffect(() => {
    const checkHealth = async () => {
      const online = await InpaintClient.checkBackendHealth();
      setBackendConnected(online);
    };
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [setBackendConnected]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsExportOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          const next = redo(sceneGraph);
          if (next) setSceneGraph(next);
        } else {
          const prev = undo(sceneGraph);
          if (prev) setSceneGraph(prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sceneGraph, undo, redo, setSceneGraph]);

  // Main File Ingestion Pipeline
  const handleProcessFile = async (file: File) => {
    setProcessing(true, 0.1, 'Validating file format...');

    const validation = await FileDetector.validateFile(file);
    if (!validation.valid) {
      alert(validation.error || 'Invalid file.');
      setProcessing(false, 0, 'Ready');
      return;
    }

    try {
      if (validation.fileType === 'pdf') {
        setProcessing(true, 0.3, 'Extracting vector text & pages with PDF.js...');
        const pdfResult = await PDFParser.parsePDF(file);
        if (pdfResult.pages.length > 0) {
          const firstPage = pdfResult.pages[0];
          setBaseCanvas(firstPage.canvas);
          setOriginalImageUrl(firstPage.canvas.toDataURL('image/png'));

          const nodes: Record<string, SceneNode> = {};
          const rootIds: string[] = [];
          for (const node of firstPage.textNodes) {
            nodes[node.id] = node;
            rootIds.push(node.id);
          }

          const newSceneGraph: SceneGraph = {
            nodes,
            rootIds,
            canvasWidth: firstPage.width,
            canvasHeight: firstPage.height,
            backgroundColor: '#FFFFFF',
            originalImageUrl: firstPage.canvas.toDataURL('image/png')
          };

          setSceneGraph(newSceneGraph);
          pushState(newSceneGraph);
        }
      } else if (validation.fileType === 'eml') {
        setProcessing(true, 0.4, 'Parsing email headers and sanitizing HTML with DOMPurify...');
        const text = await file.text();
        const parsedEmail = EMLParser.parseRawEML(text);
        const emailSceneGraph = EMLParser.buildEmailSceneGraph(parsedEmail);

        setSceneGraph(emailSceneGraph);
        pushState(emailSceneGraph);
      } else if (validation.fileType === 'docx') {
        setProcessing(true, 0.4, 'Extracting document headings and paragraphs...');
        const { sceneGraph: docxGraph, report } = await DocxParser.parseDocx(file);
        setSceneGraph(docxGraph);
        pushState(docxGraph);
        if (report.warnings.length > 0) {
          console.warn('Docx fidelity warnings:', report.warnings);
        }
      } else if (validation.fileType === 'reconstructa') {
        setProcessing(true, 0.5, 'Restoring project archive...');
        const restored = await ProjectStorage.importProjectFile(file);
        setProject(restored);
        pushState(restored.sceneGraph);
      } else {
        // Raster Image (Screenshot / PNG / JPEG / WebP)
        setProcessing(true, 0.2, 'Loading high-resolution raster image...');
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);

        setBaseCanvas(canvas);
        const dataUrl = canvas.toDataURL('image/png');
        setOriginalImageUrl(dataUrl);

        // 1. Run Vision Object Detection
        setProcessing(true, 0.4, 'Detecting UI regions, status bars, and bubbles...');
        const detectedVisuals = await ObjectDetector.detectObjects(canvas);

        // 2. Run Non-Blocking Browser OCR
        setProcessing(true, 0.6, 'Extracting text and bounding boxes via OCR Worker...');
        const ocrResult = await OCRWorkerManager.scanImage(canvas, undefined, (p, msg) => {
          setProcessing(true, 0.6 + p * 0.25, msg);
        });

        // 3. Platform Detection
        setProcessing(true, 0.88, 'Classifying semantics and identifying platform profile...');
        const platformMatch = await PlatformRegistry.detectPlatform(canvas, [ocrResult.fullText]);

        // 4. Build Universal Scene Graph
        const nodes: Record<string, SceneNode> = {};
        const rootIds: string[] = [];

        // Insert Visual Containers (Status bar, Navigation bar, etc.)
        for (const obj of detectedVisuals) {
          nodes[obj.id] = {
            id: obj.id,
            name: obj.type.toUpperCase(),
            type: obj.type,
            parentId: null,
            childrenIds: [],
            x: obj.bounds.x,
            y: obj.bounds.y,
            width: obj.bounds.width,
            height: obj.bounds.height,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            visible: true,
            locked: true,
            backgroundColor: obj.backgroundColor,
            constraints: { mode: 'fixed' },
            confidence: obj.confidence,
            source: 'vision'
          };
          rootIds.push(obj.id);
        }

        // Insert OCR Text Nodes with Semantic Classification & Typography Estimation
        let textIndex = 0;
        for (const block of ocrResult.blocks) {
          for (const line of block.lines) {
            if (!line.text) continue;
            textIndex++;
            const nodeId = `node_${textIndex}`;

            const semantic = SemanticClassifier.classify(
              line.text,
              line.bbox,
              { width: canvas.width, height: canvas.height }
            );

            const typo = FontDetector.estimate(
              canvas,
              line.bbox,
              line.text,
              platformMatch.platformId
            );

            nodes[nodeId] = {
              id: nodeId,
              name: `${semantic.role.toUpperCase()}: ${line.text.slice(0, 16)}`,
              type: semantic.role,
              parentId: null,
              childrenIds: [],
              x: line.bbox.x,
              y: line.bbox.y,
              width: line.bbox.width,
              height: line.bbox.height,
              rotation: 0,
              opacity: 1,
              zIndex: 10 + textIndex,
              visible: true,
              locked: false,
              content: line.text,
              fontFamily: typo.recommendedFamily,
              fontSize: typo.estimatedSize,
              fontWeight: typo.estimatedWeight,
              color: typo.color,
              lineHeight: 1.25,
              letterSpacing: 0,
              alignment: 'left',
              constraints: { mode: semantic.role === 'message' ? 'reflow' : 'fixed' },
              confidence: Math.round(((line.confidence + semantic.confidence) / 2) * 100) / 100,
              source: 'ocr',
              platformHint: platformMatch.platformId
            };
            rootIds.push(nodeId);
          }
        }

        const initialGraph: SceneGraph = {
          nodes,
          rootIds,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          backgroundColor: '#08070A',
          originalImageUrl: dataUrl
        };

        setSceneGraph(initialGraph);
        pushState(initialGraph);

        // Create Project instance
        const newProj: ReconstructaProject = {
          schemaVersion: 1,
          id: `proj_${Date.now()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          platform: platformMatch.platformId,
          sceneGraph: initialGraph,
          assets: {},
          versions: [],
          provenance: {
            origin: 'user_import',
            importedFileType: file.type,
            hasWatermarkEnabled: true,
            watermarkText: 'EDITED / MOCKUP',
            watermarkPosition: 'bottom-right'
          }
        };
        setProject(newProj);
        await ProjectStorage.saveProject(newProj);
      }

      setProcessing(false, 1.0, 'Ready');
    } catch (err: any) {
      console.error('File Ingestion Error:', err);
      alert(`Failed to analyze document: ${err?.message || 'Unknown processing error'}`);
      setProcessing(false, 0, 'Ready');
    }
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  // One-click Built-in Demo Generator (Chat Mockup)
  const handleLoadDemo = () => {
    const demoCanvas = document.createElement('canvas');
    demoCanvas.width = 1080;
    demoCanvas.height = 1920;
    const ctx = demoCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#08070A';
      ctx.fillRect(0, 0, 1080, 1920);
      // Status bar
      ctx.fillStyle = '#141018';
      ctx.fillRect(0, 0, 1080, 80);
      // Header
      ctx.fillStyle = '#1C1520';
      ctx.fillRect(0, 80, 1080, 140);
    }

    setBaseCanvas(demoCanvas);
    setOriginalImageUrl(demoCanvas.toDataURL('image/png'));

    const nodes: Record<string, SceneNode> = {
      header_title: {
        id: 'header_title',
        name: 'Contact Name',
        type: 'name',
        parentId: null,
        childrenIds: [],
        x: 120,
        y: 130,
        width: 320,
        height: 38,
        rotation: 0,
        opacity: 1,
        zIndex: 5,
        visible: true,
        locked: false,
        content: 'Rahul Sharma',
        fontFamily: 'Inter, sans-serif',
        fontSize: 26,
        fontWeight: 600,
        color: '#F4EFE6',
        constraints: { mode: 'fixed' },
        confidence: 0.98,
        source: 'manual'
      },
      msg_bubble_1: {
        id: 'msg_bubble_1',
        name: 'Received Bubble',
        type: 'message',
        parentId: null,
        childrenIds: ['msg_text_1', 'msg_time_1'],
        x: 60,
        y: 320,
        width: 620,
        height: 110,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        visible: true,
        locked: false,
        backgroundColor: '#201726',
        borderRadius: 14,
        constraints: { mode: 'reflow', padding: { top: 16, right: 18, bottom: 16, left: 18 } },
        confidence: 0.96,
        source: 'manual'
      },
      msg_text_1: {
        id: 'msg_text_1',
        name: 'Message Text',
        type: 'text',
        parentId: 'msg_bubble_1',
        childrenIds: [],
        x: 84,
        y: 340,
        width: 540,
        height: 48,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        visible: true,
        locked: false,
        content: 'Are you coming to the design review today?',
        fontFamily: 'Inter, sans-serif',
        fontSize: 22,
        fontWeight: 400,
        color: '#F4EFE6',
        constraints: { mode: 'reflow' },
        confidence: 0.97,
        source: 'manual'
      },
      msg_time_1: {
        id: 'msg_time_1',
        name: 'Timestamp',
        type: 'timestamp',
        parentId: 'msg_bubble_1',
        childrenIds: [],
        x: 550,
        y: 395,
        width: 100,
        height: 24,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        visible: true,
        locked: false,
        content: '10:42 AM',
        fontFamily: 'Inter, sans-serif',
        fontSize: 16,
        fontWeight: 400,
        color: '#9D96A5',
        alignment: 'right',
        constraints: { mode: 'anchor', anchor: 'bottom-right', dependsOn: ['msg_text_1'] },
        confidence: 0.94,
        source: 'manual'
      }
    };

    const demoGraph: SceneGraph = {
      nodes,
      rootIds: ['header_title', 'msg_bubble_1'],
      canvasWidth: 1080,
      canvasHeight: 1920,
      backgroundColor: '#08070A'
    };

    setSceneGraph(demoGraph);
    pushState(demoGraph);
  };

  const hasLayers = Object.keys(sceneGraph.nodes).length > 0;

  return (
    <div
      className="app-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Luxury Workstation Header */}
      <LuxuryHeader
        onFileUpload={handleProcessFile}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* Main Workspace Layout */}
      <div className="app-workspace">
        {/* Left Sidebar (Layers & OCR Review) */}
        <LeftSidebar />

        {/* Center Canvas Viewport or Empty State */}
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {isAnalyzing && (
            <div
              style={{
                position: 'absolute',
                top: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 200,
                background: 'rgba(20, 16, 24, 0.95)',
                border: '1px solid var(--border-gold-bright)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-gold)',
                padding: '10px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: '2px solid var(--gold-antique)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'rotateConic 1s linear infinite'
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-ivory)', fontWeight: 500 }}>
                {statusMessage}
              </span>
            </div>
          )}

          {!hasLayers ? (
            /* Luxury Empty State */
            <div
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
                textAlign: 'center'
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'var(--surface-dark)',
                  border: '1px solid var(--border-gold-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20,
                  boxShadow: 'var(--shadow-gold)'
                }}
              >
                <UploadCloud size={32} style={{ color: 'var(--gold-antique)' }} />
              </div>

              <h2
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: 'var(--gold-light)',
                  marginBottom: 8
                }}
              >
                IMPORT VISUAL OR DOCUMENT
              </h2>

              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  maxWidth: 480,
                  lineHeight: 1.6,
                  marginBottom: 24
                }}
              >
                Drag and drop any screenshot, PNG, JPEG, WebP, PDF, EML, or DOCX document to begin
                intelligent OCR decomposition, typography fitting, and non-destructive visual reconstruction.
              </p>

              <div style={{ display: 'flex', gap: 12 }}>
                <LuxuryButton
                  variant="primary"
                  onClick={() => {
                    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
                    input?.click();
                  }}
                >
                  <UploadCloud size={14} /> Browse Local File
                </LuxuryButton>

                <LuxuryButton variant="default" onClick={handleLoadDemo}>
                  <Sparkles size={14} /> Load Interactive Demo
                </LuxuryButton>
              </div>

              {/* Supported Badges */}
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  marginTop: 40,
                  fontSize: 11,
                  color: 'var(--text-subtle)',
                  fontFamily: 'var(--font-mono)'
                }}
              >
                <span>• SCREENSHOTS</span>
                <span>• PDF (NATIVE & SCANNED)</span>
                <span>• EML EMAILS</span>
                <span>• DOCX & PPTX</span>
              </div>
            </div>
          ) : viewMode === 'split' ? (
            <BeforeAfterSplit originalImageUrl={originalImageUrl} />
          ) : (
            <CanvasViewport />
          )}

          {/* Drag and Drop Fullscreen Highlight Overlay */}
          {isDragOver && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(8, 7, 10, 0.9)',
                border: '2px dashed var(--gold-antique)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 400
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 18,
                  color: 'var(--gold-light)',
                  letterSpacing: '0.1em'
                }}
              >
                RELEASE TO ANALYZE DOCUMENT
              </span>
            </div>
          )}
        </main>

        {/* Right Dynamic Contextual Inspector */}
        <Inspector />
      </div>

      {/* Bottom Status Bar */}
      <footer className="app-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>STATUS: {statusMessage.toUpperCase()}</span>
          <span>LAYERS: {Object.keys(sceneGraph.nodes).length}</span>
          <span>RESOLUTION: {sceneGraph.canvasWidth} × {sceneGraph.canvasHeight}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>ENGINE: TESSERACT.JS + OPENCV READY</span>
          <span>PROVENANCE: ACTIVE</span>
        </div>
      </footer>

      {/* Modals & Overlays */}
      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        baseCanvas={baseCanvas}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenExport={() => setIsExportOpen(true)}
      />
    </div>
  );
};
