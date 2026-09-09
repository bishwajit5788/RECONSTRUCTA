/**
 * RECONSTRUCTA — PDF PARSER & VECTOR/SCANNED ENGINE
 * Extracts pages, vector text objects, font metrics, and provides page manipulation & re-export via pdfjs-dist and pdf-lib.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { SceneGraph, SceneNode } from '../types/sceneGraph';

// Set up PDF.js worker source using CDN or local worker bundle
if (typeof window !== 'undefined' && 'GlobalWorkerOptions' in pdfjsLib) {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + (pdfjsLib.version || '4.0.379') + '/build/pdf.worker.min.mjs';
}

export interface PDFPageData {
  pageNumber: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  textNodes: SceneNode[];
  isScanned: boolean;
}

export interface PDFParseResult {
  numPages: number;
  pages: PDFPageData[];
  title?: string;
  author?: string;
}

export class PDFParser {
  /**
   * Parses an uploaded PDF file into editable pages and scene graph layers
   */
  static async parsePDF(file: File): Promise<PDFParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    const numPages = pdfDoc.numPages;
    const pages: PDFPageData[] = [];

    for (let pageNum = 1; pageNum <= Math.min(numPages, 30); pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 }); // High-res rendering

      // 1. Render Page to Canvas
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

      // 2. Extract Native Vector Text Content
      const textContent = await page.getTextContent();
      const textNodes: SceneNode[] = [];

      for (let i = 0; i < textContent.items.length; i++) {
        const item: any = textContent.items[i];
        if (!item.str || !item.str.trim()) continue;

        // Transform matrix [scaleX, skewY, skewX, scaleY, transformX, transformY]
        const tx = item.transform[4] * 1.5;
        const ty = viewport.height - item.transform[5] * 1.5; // PDF origin is bottom-left
        const fontSize = Math.max(Math.round(item.height * 1.5), 10);
        const fontWidth = Math.max(Math.round(item.width * 1.5), 20);

        textNodes.push({
          id: `pdf_p${pageNum}_t${i}`,
          name: item.str.slice(0, 24),
          type: item.height > 18 ? 'heading' : 'text',
          parentId: null,
          childrenIds: [],
          x: Math.round(tx),
          y: Math.max(Math.round(ty - fontSize), 0),
          width: fontWidth,
          height: fontSize + 4,
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
          source: 'pdf'
        });
      }

      // If page has almost no native vector text (< 3 items), classify as scanned document
      const isScanned = textNodes.length < 3;

      pages.push({
        pageNumber: pageNum,
        width: viewport.width,
        height: viewport.height,
        canvas,
        textNodes,
        isScanned
      });
    }

    return {
      numPages,
      pages
    };
  }

  /**
   * Generates a new multi-page PDF from the edited scene graph
   */
  static async exportToPDF(pages: { canvas: HTMLCanvasElement; textNodes: SceneNode[] }[]): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();

    for (const pageData of pages) {
      const { canvas } = pageData;
      const pngDataUrl = canvas.toDataURL('image/png');
      const pngImageBytes = await fetch(pngDataUrl).then((res) => res.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngImageBytes);

      const page = pdfDoc.addPage([canvas.width, canvas.height]);
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes as any], { type: 'application/pdf' });
  }
}
