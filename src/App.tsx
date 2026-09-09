/**
 * RECONSTRUCTA — MAIN APPLICATION SHELL
 * Unified visual reconstruction workstation: file ingestion, vision/OCR pipeline,
 * canvas editing, reflow, multi-page presentations (PPTX / PDF), asset library,
 * checkpoint versioning, debounced autosave, and export.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from './store/useEditorStore';
import { useHistoryStore } from './store/useHistoryStore';
import { LuxuryHeader } from './components/header/LuxuryHeader';
import { LeftSidebar } from './components/leftPanel/LeftSidebar';
import { CanvasViewport } from './components/canvas/CanvasViewport';
import { BeforeAfterSplit } from './components/canvas/BeforeAfterSplit';
import { SlideViewer } from './components/canvas/SlideViewer';
import { Inspector } from './components/rightPanel/Inspector';
import { ExportDialog } from './components/dialogs/ExportDialog';
import { CommandPalette } from './components/dialogs/CommandPalette';
import { AssetGalleryDialog } from './components/dialogs/AssetGalleryDialog';
import { VersionHistoryDialog } from './components/dialogs/VersionHistoryDialog';

import { FileDetector } from './parsers/fileDetector';
import { PDFParser } from './parsers/pdfParser';
import { EMLParser } from './parsers/emlParser';
import { DocxParser } from './parsers/docxParser';
import { PptxParser, PptxSlideData } from './parsers/pptxParser';
import { OCRWorkerManager } from './engine/ocr/ocrWorker';
import { ObjectDetector } from './engine/vision/objectDetector';
import { SemanticClassifier } from './engine/vision/semanticClassifier';
import { FontDetector } from './engine/typography/fontDetector';
import { PlatformRegistry } from './engine/platforms/PlatformRegistry';
import { InpaintClient } from './engine/inpaint/inpaintClient';
import { ProjectStorage } from './engine/project/storage';

import { SceneGraph, SceneNode } from './types/sceneGraph';
import { ReconstructaProject, ProjectAsset } from './types/project';
import { UploadCloud, Sparkles, AlertCircle, RotateCcw, X } from 'lucide-react';
import { LuxuryButton } from './components/common/LuxuryButton';

export const App: React.FC = () => {
  const {
    sceneGraph,
    viewMode,
    statusMessage,
    project,
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
  const [isAssetGalleryOpen, setIsAssetGalleryOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Multi-slide / Presentation & Multi-page PDF State
  const [pptxSlides, setPptxSlides] = useState<PptxSlideData[]>([]);
  const [currentSlideIdx, setCurrentSlideIdx] = useState<number>(0);
  const [pptxWarnings, setPptxWarnings] = useState<string[]>([]);

  // Autosave & Crash Recovery State
  const [saveStatus, setSaveStatus] = useState<string>('Saved');
  const [crashSnapshot, setCrashSnapshot] = useState<{ sceneGraph: SceneGraph; projectName: string } | null>(null);
  const lastSavedGraphRef = useRef<string>('');

  // 1. Initial Mount: 2-Hour Retention sweep & check crash snapshot
  useEffect(() => {
    const initPersistence = async () => {
      // Purge local storage older than 2 hours
      await ProjectStorage.purgeExpiredLocalProjects();

      // Check crash snapshot
      const snapshot = await ProjectStorage.loadCrashSnapshot();
      if (snapshot && Object.keys(snapshot.sceneGraph.nodes || {}).length > 0) {
        setCrashSnapshot(snapshot);
      }
    };
    initPersistence();
  }, []);

  // 2. Debounced Autosave (every 3s when sceneGraph changes)
  useEffect(() => {
    const serialized = JSON.stringify(sceneGraph);
    if (!lastSavedGraphRef.current) {
      lastSavedGraphRef.current = serialized;
      return;
    }

    if (serialized !== lastSavedGraphRef.current) {
      setSaveStatus('Unsaved changes...');
      const timer = setTimeout(async () => {
        await ProjectStorage.saveCrashSnapshot(sceneGraph, project?.name || 'Current Project');
        if (project) {
          project.sceneGraph = sceneGraph;
          project.updatedAt = Date.now();
          await ProjectStorage.saveProject(project);
        }
        lastSavedGraphRef.current = serialized;
        setSaveStatus('Autosaved');
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [sceneGraph, project]);

  // 3. Poll backend health every 10s
  useEffect(() => {
    const checkHealth = async () => {
      const online = await InpaintClient.checkBackendHealth();
      setBackendConnected(online);
    };
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [setBackendConnected]);

  // 4. Global Keyboard Shortcuts
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
          if (pdfResult.pages.length > 1) {
            const convertedSlides: PptxSlideData[] = pdfResult.pages.map((p) => ({
              slideNumber: p.pageNumber,
              width: p.width,
              height: p.height,
              textNodes: p.textNodes,
              imageNodes: []
            }));
            setPptxSlides(convertedSlides);
            setPptxWarnings(pdfResult.safetyNotice ? [pdfResult.safetyNotice] : []);
            setCurrentSlideIdx(0);
          } else {
            setPptxSlides([]);
            setPptxWarnings([]);
          }

          const firstPage = pdfResult.pages[0];
          setBaseCanvas(firstPage.canvas);
          setOriginalImageUrl(firstPage.canvas.toDataURL('image/png'));

          const pageGraph = PDFParser.buildPageSceneGraph(firstPage);
          setSceneGraph(pageGraph);
          pushState(pageGraph);

          if (pdfResult.safetyNotice) {
            console.info('PDF Safety Notice:', pdfResult.safetyNotice);
          }
        }
      } else if (validation.fileType === 'pptx') {
        setProcessing(true, 0.35, 'Unpacking PowerPoint OpenXML slides & media...');
        const pptxResult = await PptxParser.parsePptx(file);
        if (pptxResult.slides.length > 0) {
          setPptxSlides(pptxResult.slides);
          setPptxWarnings(pptxResult.report.warnings);
          setCurrentSlideIdx(0);

          const initialSlideGraph = PptxParser.buildSlideSceneGraph(pptxResult.slides[0]);
          setSceneGraph(initialSlideGraph);
          pushState(initialSlideGraph);
        }
      } else if (validation.fileType === 'eml') {
        setProcessing(true, 0.4, 'Parsing email headers, attachments, and sanitized HTML...');
        const text = await file.text();
        const parsedEmail = EMLParser.parseRawEML(text);
        const emailSceneGraph = EMLParser.buildEmailSceneGraph(parsedEmail);

        // Save attachments into project asset catalog
        if (parsedEmail.attachments.length > 0) {
          const assetsMap: Record<string, ProjectAsset> = {};
          parsedEmail.attachments.forEach((att, idx) => {
            assetsMap[`att_${idx}`] = {
              id: `att_${idx}`,
              name: att.filename,
              type: 'document',
              mimeType: att.contentType,
              dataUrl: att.dataUrl || '',
              createdAt: Date.now(),
              sizeBytes: att.sizeBytes
            };
          });

          const newProj: ReconstructaProject = {
            schemaVersion: 1,
            id: `proj_eml_${Date.now()}`,
            name: parsedEmail.subject,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            platform: 'generic',
            sceneGraph: emailSceneGraph,
            assets: assetsMap,
            versions: [],
            provenance: {
              origin: 'user_import',
              importedFileType: 'eml',
              hasWatermarkEnabled: true,
              watermarkText: 'RECONSTRUCTA — EDITED / MOCKUP',
              watermarkPosition: 'bottom-right'
            }
          };
          setProject(newProj);
        }

        setPptxSlides([]);
        setSceneGraph(emailSceneGraph);
        pushState(emailSceneGraph);
      } else if (validation.fileType === 'docx') {
        setProcessing(true, 0.4, 'Extracting document headings, paragraphs, and media...');
        const { sceneGraph: docxGraph, report } = await DocxParser.parseDocx(file);
        setPptxSlides([]);
        setSceneGraph(docxGraph);
        pushState(docxGraph);
        if (report.warnings.length > 0) {
          console.warn('Docx fidelity warnings:', report.warnings);
        }
      } else if (validation.fileType === 'reconstructa') {
        setProcessing(true, 0.5, 'Validating and restoring project archive...');
        const restored = await ProjectStorage.importProjectFile(file);
        setPptxSlides([]);
        setProject(restored);
        setSceneGraph(restored.sceneGraph);
        pushState(restored.sceneGraph);
      } else {
        // Raster Image (Screenshot / PNG / JPEG / WebP)
        setPptxSlides([]);
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

        // 1. Run Evidence-Based Vision Object Detection
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
            backgroundColor: obj.properties.backgroundColor,
            constraints: { mode: 'fixed' },
            confidence: obj.confidence,
            confidenceLabel: obj.confidenceLabel,
            reviewRequired: obj.reviewRequired,
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
              color: typo.estimatedColor,
              lineHeight: 1.25,
              letterSpacing: 0,
              alignment: 'left',
              constraints: { mode: semantic.role === 'message' ? 'reflow' : 'fixed' },
              confidence: Math.round(((line.confidence + semantic.confidence) / 2) * 100) / 100,
              confidenceLabel: typo.confidenceLabel === 'High confidence' ? 'HIGH' : typo.confidenceLabel === 'Estimated' ? 'MEDIUM' : 'LOW',
              source: 'ocr',
              platformHint: platformMatch.platformId
            };
            rootIds.push(nodeId);
          }
        }

        const newSceneGraph: SceneGraph = {
          nodes,
          rootIds,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          backgroundColor: '#08070A',
          originalImageUrl: dataUrl
        };

        const newProject: ReconstructaProject = {
          schemaVersion: 1,
          id: `proj_${Date.now()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          platform: platformMatch.platformId,
          sceneGraph: newSceneGraph,
          assets: {
            original: {
              id: 'original',
              name: file.name,
              type: 'background',
              mimeType: file.type,
              dataUrl,
              createdAt: Date.now(),
              sizeBytes: file.size
            }
          },
          versions: [],
          provenance: {
            origin: 'user_import',
            importedFileType: file.type,
            hasWatermarkEnabled: true,
            watermarkText: 'RECONSTRUCTA — EDITED / MOCKUP',
            watermarkPosition: 'bottom-right'
          }
        };

        setProject(newProject);
        setSceneGraph(newSceneGraph);
        pushState(newSceneGraph);
      }

      setProcessing(false, 1.0, 'Analysis & reconstruction complete.');
    } catch (err: any) {
      console.error('File parsing error:', err);
      alert(`Processing error: ${err.message || 'Could not parse document.'}`);
      setProcessing(false, 0, 'Ready');
    }
  };

  // Restore Crash Recovery Snapshot
  const handleRestoreCrashSnapshot = () => {
    if (!crashSnapshot) return;
    setSceneGraph(crashSnapshot.sceneGraph);
    pushState(crashSnapshot.sceneGraph);
    setCrashSnapshot(null);
    ProjectStorage.clearCrashSnapshot();
  };

  const handleDismissCrashSnapshot = () => {
    setCrashSnapshot(null);
    ProjectStorage.clearCrashSnapshot();
  };

  // Load Interactive Demo
  const handleLoadDemo = () => {
    setProcessing(true, 0.4, 'Initializing interactive chat reconstruction mockup...');

    const demoNodes: Record<string, SceneNode> = {
      bg_statusbar: {
        id: 'bg_statusbar',
        name: 'STATUS BAR',
        type: 'status-bar',
        parentId: null,
        childrenIds: [],
        x: 0,
        y: 0,
        width: 1080,
        height: 60,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        visible: true,
        locked: true,
        backgroundColor: '#0F0D14',
        constraints: { mode: 'fixed' },
        confidence: 0.98,
        confidenceLabel: 'HIGH',
        source: 'vision'
      },
      header_card: {
        id: 'header_card',
        name: 'HEADER BAR',
        type: 'navigation-bar',
        parentId: null,
        childrenIds: ['avatar_profile', 'title_contact'],
        x: 0,
        y: 60,
        width: 1080,
        height: 120,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        visible: true,
        locked: true,
        backgroundColor: '#16121C',
        strokeColor: 'rgba(212, 175, 55, 0.3)',
        strokeWidth: 1,
        constraints: { mode: 'fixed' },
        confidence: 0.96,
        confidenceLabel: 'HIGH',
        source: 'vision'
      },
      avatar_profile: {
        id: 'avatar_profile',
        name: 'Profile Avatar',
        type: 'avatar',
        parentId: 'header_card',
        childrenIds: [],
        x: 48,
        y: 84,
        width: 72,
        height: 72,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        visible: true,
        locked: false,
        backgroundColor: '#D4AF37',
        borderRadius: 36,
        constraints: { mode: 'fixed' },
        confidence: 0.95,
        confidenceLabel: 'HIGH',
        source: 'vision'
      },
      title_contact: {
        id: 'title_contact',
        name: 'Contact Name',
        type: 'heading',
        parentId: 'header_card',
        childrenIds: [],
        x: 144,
        y: 98,
        width: 380,
        height: 40,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        visible: true,
        locked: false,
        content: 'Elena Vance',
        fontFamily: 'Playfair Display, serif',
        fontSize: 26,
        fontWeight: 600,
        color: '#F4EFE6',
        alignment: 'left',
        constraints: { mode: 'fixed' },
        confidence: 1.0,
        confidenceLabel: 'HIGH',
        source: 'manual'
      },
      bubble_1: {
        id: 'bubble_1',
        name: 'Received Bubble 1',
        type: 'message',
        parentId: null,
        childrenIds: ['text_msg_1', 'timestamp_1'],
        x: 64,
        y: 240,
        width: 620,
        height: 110,
        rotation: 0,
        opacity: 1,
        zIndex: 4,
        visible: true,
        locked: false,
        backgroundColor: '#1C1724',
        strokeColor: 'rgba(212, 175, 55, 0.2)',
        strokeWidth: 1,
        borderRadius: 16,
        constraints: { mode: 'auto' },
        confidence: 0.92,
        confidenceLabel: 'HIGH',
        source: 'vision'
      },
      text_msg_1: {
        id: 'text_msg_1',
        name: 'Message Text 1',
        type: 'text',
        parentId: 'bubble_1',
        childrenIds: [],
        x: 88,
        y: 260,
        width: 570,
        height: 50,
        rotation: 0,
        opacity: 1,
        zIndex: 5,
        visible: true,
        locked: false,
        content: 'The architectural mockups have been calibrated to the highest fidelity.',
        fontFamily: 'Inter, sans-serif',
        fontSize: 18,
        fontWeight: 400,
        color: '#FFFFFF',
        lineHeight: 1.35,
        alignment: 'left',
        constraints: { mode: 'reflow' },
        confidence: 0.98,
        confidenceLabel: 'HIGH',
        source: 'manual'
      },
      timestamp_1: {
        id: 'timestamp_1',
        name: 'Timestamp 1',
        type: 'timestamp',
        parentId: 'bubble_1',
        childrenIds: [],
        x: 570,
        y: 318,
        width: 80,
        height: 20,
        rotation: 0,
        opacity: 1,
        zIndex: 5,
        visible: true,
        locked: false,
        content: '10:42 AM',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        fontWeight: 400,
        color: '#8C6A20',
        alignment: 'right',
        constraints: { mode: 'fixed', anchor: 'bottom-right', dependsOn: ['text_msg_1'] },
        confidence: 1.0,
        confidenceLabel: 'HIGH',
        source: 'manual'
      },
      bubble_2: {
        id: 'bubble_2',
        name: 'Message Bubble 2 (Sender)',
        type: 'message',
        parentId: null,
        childrenIds: ['text_msg_2'],
        x: 400,
        y: 380,
        width: 616,
        height: 96,
        rotation: 0,
        opacity: 1,
        zIndex: 4,
        visible: true,
        locked: false,
        backgroundColor: '#4A1D2F',
        strokeColor: '#D4AF37',
        strokeWidth: 1,
        borderRadius: 16,
        constraints: { mode: 'reflow' },
        confidence: 0.94,
        confidenceLabel: 'HIGH',
        source: 'vision'
      },
      text_msg_2: {
        id: 'text_msg_2',
        name: 'Message Text 2',
        type: 'text',
        parentId: 'bubble_2',
        childrenIds: [],
        x: 424,
        y: 404,
        width: 560,
        height: 48,
        rotation: 0,
        opacity: 1,
        zIndex: 5,
        visible: true,
        locked: false,
        content: 'Exceptional precision. Ready for production verification.',
        fontFamily: 'Inter, sans-serif',
        fontSize: 18,
        fontWeight: 500,
        color: '#F4EFE6',
        lineHeight: 1.35,
        alignment: 'left',
        constraints: { mode: 'reflow' },
        confidence: 1.0,
        confidenceLabel: 'HIGH',
        source: 'manual'
      }
    };

    const demoGraph: SceneGraph = {
      nodes: demoNodes,
      rootIds: ['bg_statusbar', 'header_card', 'bubble_1', 'bubble_2'],
      canvasWidth: 1080,
      canvasHeight: 1920,
      backgroundColor: '#08070A'
    };

    const demoProject: ReconstructaProject = {
      schemaVersion: 1,
      id: `demo_proj_${Date.now()}`,
      name: 'Luxury Chat Reconstruction',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      platform: 'whatsapp',
      sceneGraph: demoGraph,
      assets: {},
      versions: [],
      provenance: {
        origin: 'scratch',
        hasWatermarkEnabled: true,
        watermarkText: 'RECONSTRUCTA — EDITED / MOCKUP',
        watermarkPosition: 'bottom-right'
      }
    };

    setPptxSlides([]);
    setProject(demoProject);
    setSceneGraph(demoGraph);
    pushState(demoGraph);
    setProcessing(false, 1.0, 'Interactive demo loaded.');
  };

  return (
    <div
      className="app-container"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleProcessFile(file);
      }}
    >
      {/* Workstation Header */}
      <LuxuryHeader
        onFileUpload={handleProcessFile}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenAssetGallery={() => setIsAssetGalleryOpen(true)}
        onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
        saveStatus={saveStatus}
      />

      {/* Crash Recovery Notification Toast Banner */}
      {crashSnapshot && (
        <div
          style={{
            background: 'var(--surface-dark)',
            borderBottom: '1px solid var(--gold-antique)',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 60,
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-ivory)' }}>
            <AlertCircle size={15} color="var(--gold-bright)" />
            <span>
              Uncommitted editing session recovered (<strong>{crashSnapshot.projectName}</strong>). Restore previous state?
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LuxuryButton size="sm" onClick={handleRestoreCrashSnapshot}>
              <RotateCcw size={12} /> Restore Session
            </LuxuryButton>
            <button
              onClick={handleDismissCrashSnapshot}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              title="Discard snapshot"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Workspace Body */}
      <div className="workspace-container">
        {/* Left Navigation: Layer Tree / OCR Review Panel */}
        <LeftSidebar />

        {/* Central Interactive Viewport Area */}
        <main className="canvas-main-area" style={{ display: 'flex', width: '100%', height: '100%' }}>
          {/* Optional PPTX Slide Viewer Sidebar */}
          {pptxSlides.length > 0 && (
            <SlideViewer
              slides={pptxSlides}
              currentSlideIndex={currentSlideIdx}
              onSelectSlide={setCurrentSlideIdx}
              fidelityWarnings={pptxWarnings}
            />
          )}

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {Object.keys(sceneGraph.nodes).length === 0 ? (
              /* Empty State Landing Experience */
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  padding: 32,
                  textAlign: 'center'
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, var(--gold-border-subtle) 0%, transparent 75%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 20,
                    border: '1px solid var(--gold-border-bright)'
                  }}
                >
                  <UploadCloud size={32} color="var(--gold-light)" />
                </div>

                <h2
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 26,
                    color: 'var(--gold-light)',
                    marginBottom: 8
                  }}
                >
                  RECONSTRUCTA WORKSTATION
                </h2>

                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    maxWidth: 480,
                    lineHeight: 1.6,
                    marginBottom: 28
                  }}
                >
                  Import any screenshot, high-resolution document, or presentation. RECONSTRUCTA reconstructs raster
                  content into non-destructive, constraint-aware editable layers.
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
          </div>

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
          <span>RETENTION: 2 HOURS</span>
          <span>ENGINE: LOCAL WORKER + OPENCV READY</span>
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

      <AssetGalleryDialog
        isOpen={isAssetGalleryOpen}
        onClose={() => setIsAssetGalleryOpen(false)}
      />

      <VersionHistoryDialog
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
      />
    </div>
  );
};
