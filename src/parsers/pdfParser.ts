/**
 * RECONSTRUCTA — MULTI-PAGE PDF VECTOR & SCANNED PARSER
 * Extracts all pages with configurable safety thresholds (no silent 30-page truncation),
 * vector text items with coordinates, page thumbnails, and page rotation.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { SceneGraph, SceneNode } from '../types/sceneGraph';

// Configure PDF.js worker
if (typeof window !== 'undefined' && 'GlobalWorkerOptions' in pdfjsLib) {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + (pdfjsLib.version || '4.0.379') + '/build/pdf.worker.min.mjs';
}

export interface PDFPageData {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270
  canvas: HTMLCanvasElement;
  thumbnailUrl: string;
  textNodes: SceneNode[];
  isScanned: boolean;
}

export interface PDFParseResult {
  numPages: number;
  loadedPagesCount: number;
  safetyNotice?: string;
  pages: PDFPageData[];
  title?: string;
  author?: string;
}

export class PDFParser {
  /**
   * Parses an uploaded PDF file into editable pages without silent page cutoffs
   */
  static async parsePDF(
    file: File,
    maxPages: number = 100
  ): Promise<PDFParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    const numPages = pdfDoc.numPages;
    const pagesToLoad = Math.min(numPages, maxPages);
    let safetyNotice: string | undefined = undefined;

    if (numPages > maxPages) {
      safetyNotice = `Document contains ${numPages} pages. First ${maxPages} pages loaded for browser memory safety. Additional pages can be loaded on request.`;
    }

    const pages: PDFPageData[] = [];

    for (let pageNum = 1; pageNum <= pagesToLoad; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      // 1. Render Page to High-Resolution Canvas
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        await (page.render({
          canvasContext: ctx,
          viewport
        } as any).promise);
      }

      // Generate thumbnail
      const thumbCanvas = document.createElement('canvas');
      const thumbScale = 0.25;
      thumbCanvas.width = Math.round(viewport.width * thumbScale);
      thumbCanvas.height = Math.round(viewport.height * thumbScale);
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx) {
        thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      }
      const thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

      // 2. Extract Native Vector Text Content
      const textContent = await page.getTextContent();
      const textNodes: SceneNode[] = [];

      for (let i = 0; i < textContent.items.length; i++) {
        const item: any = textContent.items[i];
        if (!item.str || !item.str.trim()) continue;

        const tx = item.transform[4] * 1.5;
        const ty = viewport.height - item.transform[5] * 1.5;
        const fontSize = Math.max(Math.round(item.height * 1.5), 10);
        const fontWidth = Math.max(Math.round(item.width * 1.5), 20);

        const bbox = {
          x: Math.round(tx),
          y: Math.max(Math.round(ty - fontSize), 0),
          width: fontWidth,
          height: fontSize + 4
        };

        textNodes.push({
          id: `pdf_p${pageNum}_t${i}`,
          name: item.str.slice(0, 24),
          type: item.height > 18 ? 'heading' : 'text',
          parentId: null,
          childrenIds: [],
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
          rotation: 0,
          opacity: 1,
          zIndex: 10 + i,
          visible: true,
          locked: false,
          content: item.str,
          fontFamily: item.fontName?.includes('Serif') ? 'Playfair Display, serif' : 'Inter, sans-serif',
          fontSize,
          fontWeight: item.fontName?.includes('Bold') ? 700 : 400,
          color: '#111111',
          lineHeight: 1.2,
          letterSpacing: 0,
          alignment: 'left',
          constraints: { mode: 'fixed' },
          confidence: 0.98,
          confidenceLabel: 'HIGH',
          source: 'pdf',
          sourceRegion: bbox,
          confidenceSource: 'direct_pdf_stream',
          evidence: {
            pdfGlyphFont: item.fontName || 'Unknown',
            scaleFactor: 1.5,
            isVectorExtracted: true
          },
          detectionMethod: 'PDF.js vector glyph stream extraction',
          reconstructionStatus: 'native',
          limitations: []
        });
      }

      // Check if scanned (no vector text recovered)
      const isScanned = textNodes.length === 0;

      pages.push({
        pageNumber: pageNum,
        width: viewport.width,
        height: viewport.height,
        rotation: 0,
        canvas,
        thumbnailUrl,
        textNodes,
        isScanned
      });
    }

    return {
      numPages,
      loadedPagesCount: pages.length,
      safetyNotice,
      pages
    };
  }

  /**
   * Reorders pages in the PDF document
   */
  static reorderPages(pages: PDFPageData[], fromIndex: number, toIndex: number): PDFPageData[] {
    if (fromIndex < 0 || fromIndex >= pages.length || toIndex < 0 || toIndex >= pages.length) {
      return pages;
    }
    const copy = [...pages];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, moved);
    return copy.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
  }

  /**
   * Deletes a page by index
   */
  static deletePage(pages: PDFPageData[], pageIndex: number): PDFPageData[] {
    if (pages.length <= 1 || pageIndex < 0 || pageIndex >= pages.length) {
      return pages;
    }
    return pages.filter((_, idx) => idx !== pageIndex).map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
  }

  /**
   * Rotates a page by specified degrees (90, 180, 270)
   */
  static rotatePage(page: PDFPageData, degrees: 90 | 180 | 270): PDFPageData {
    const newRot = ((page.rotation || 0) + degrees) % 360;
    return { ...page, rotation: newRot };
  }

  /**
   * Converts a specific PDF page into an editable scene graph
   */
  static buildPageSceneGraph(page: PDFPageData): SceneGraph {
    const nodes: Record<string, SceneNode> = {};
    const rootIds: string[] = [];

    // Background plane
    const bgId = `pdf_p${page.pageNumber}_bg`;
    nodes[bgId] = {
      id: bgId,
      name: `Page ${page.pageNumber} Canvas Background`,
      type: 'background',
      parentId: null,
      childrenIds: [],
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
      rotation: page.rotation || 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: true,
      src: page.canvas.toDataURL('image/png'),
      backgroundColor: '#FFFFFF',
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      confidenceLabel: 'HIGH',
      source: 'pdf',
      sourceRegion: { x: 0, y: 0, width: page.width, height: page.height },
      confidenceSource: 'direct_pdf_stream',
      detectionMethod: 'PDF.js canvas rendering',
      reconstructionStatus: 'flattened',
      limitations: ['Non-text vector shapes, gradients, and lines flattened into raster background']
    };
    rootIds.push(bgId);

    // Overlay recoverable text nodes
    for (const tn of page.textNodes) {
      nodes[tn.id] = tn;
      rootIds.push(tn.id);
    }

    return {
      nodes,
      rootIds,
      canvasWidth: page.width,
      canvasHeight: page.height,
      backgroundColor: '#FFFFFF',
      originalImageUrl: page.canvas.toDataURL('image/png')
    };
  }

  /**
   * Generates a PDF Blob from canvas pages
   */
  static async exportToPDF(
    pages: { canvas: HTMLCanvasElement; textNodes?: SceneNode[] }[]
  ): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();
    for (const p of pages) {
      const pageImageBytes = await fetch(p.canvas.toDataURL('image/png')).then((r) => r.arrayBuffer());
      const embeddedImage = await pdfDoc.embedPng(pageImageBytes);
      const page = pdfDoc.addPage([p.canvas.width, p.canvas.height]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: p.canvas.width,
        height: p.canvas.height
      });
    }
    const bytes = await pdfDoc.save();
    return new Blob([bytes as any], { type: 'application/pdf' });
  }
}
