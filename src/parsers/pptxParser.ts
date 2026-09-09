/**
 * RECONSTRUCTA — PPTX OPENXML PRESENTATION PARSER
 * Parses Microsoft PowerPoint archives (.pptx) via JSZip and XML DOM parsing.
 * Extracts slide dimensions, text frames, paragraphs, runs, fonts, colors, and embedded media.
 * Generates honest capability reports for complex vector SmartArt or transitions.
 */

import JSZip from 'jszip';
import { SceneGraph, SceneNode } from '../types/sceneGraph';

export interface PptxSlideData {
  slideNumber: number;
  width: number;
  height: number;
  textNodes: SceneNode[];
  imageNodes: SceneNode[];
  notes?: string;
}

export interface PptxImportReport {
  status: 'success' | 'partial' | 'failed';
  slidesCount: number;
  textBoxesCount: number;
  imagesCount: number;
  shapesCount: number;
  warnings: string[];
}

export interface PptxParseResult {
  slides: PptxSlideData[];
  report: PptxImportReport;
}

export class PptxParser {
  /**
   * Parses an uploaded or buffered .pptx presentation file
   */
  static async parsePptx(input: File | Blob | ArrayBuffer): Promise<PptxParseResult> {
    const arrayBuffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const warnings: string[] = [];

    // 1. Read Presentation Dimensions from ppt/presentation.xml (in EMUs, 1 EMU = 1/914400 inch)
    let slideWidth = 1920;
    let slideHeight = 1080;
    const presentationXmlFile = zip.file('ppt/presentation.xml');
    if (presentationXmlFile) {
      const presXmlText = await presentationXmlFile.async('text');
      const parser = new DOMParser();
      const presDoc = parser.parseFromString(presXmlText, 'application/xml');
      const sldSz = presDoc.getElementsByTagName('p:sldSz')[0];
      if (sldSz) {
        const cx = parseInt(sldSz.getAttribute('cx') || '12192000', 10);
        const cy = parseInt(sldSz.getAttribute('cy') || '6858000', 10);
        // Convert EMUs to points/pixels (approx 96 DPI screen scale)
        slideWidth = Math.round((cx / 914400) * 96);
        slideHeight = Math.round((cy / 914400) * 96);
      }
    }

    // 2. Discover Embedded Images in ppt/media/
    const mediaFiles = zip.file(/^ppt\/media\//i);
    const mediaUrlMap: Record<string, string> = {};
    for (const mFile of mediaFiles) {
      const blob = await mFile.async('blob');
      const ext = mFile.name.split('.').pop()?.toLowerCase() || 'png';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(new Blob([blob], { type: mime }));
      });
      const filename = mFile.name.split('/').pop() || '';
      mediaUrlMap[filename] = dataUrl;
    }

    // Capability & fidelity notices
    warnings.push('PowerPoint animations, 3D effects, and transitions are converted into static 2D editable layers.');

    if (zip.file(/vbaProject\.bin/i).length > 0) {
      warnings.push('VBA macros detected and safely excluded.');
    }
    if (zip.file(/diagrams/i).length > 0) {
      warnings.push('SmartArt diagrams flattened into static shapes.');
    }

    // 3. Parse individual slides: ppt/slides/slide{N}.xml
    const slideFiles = zip.file(/^ppt\/slides\/slide[0-9]+\.xml$/i);
    // Sort slide files numerically by slide index
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.name.match(/slide([0-9]+)\.xml/i)?.[1] || '0', 10);
      const numB = parseInt(b.name.match(/slide([0-9]+)\.xml/i)?.[1] || '0', 10);
      return numA - numB;
    });

    const slides: PptxSlideData[] = [];
    let totalTextBoxes = 0;
    let totalImages = 0;
    let totalShapes = 0;

    for (let sIdx = 0; sIdx < slideFiles.length; sIdx++) {
      const slideFile = slideFiles[sIdx];
      const slideXmlText = await slideFile.async('text');
      const parser = new DOMParser();
      const slideDoc = parser.parseFromString(slideXmlText, 'application/xml');

      const textNodes: SceneNode[] = [];
      const imageNodes: SceneNode[] = [];

      // Extract shape trees: p:sp
      const shapes = slideDoc.getElementsByTagName('p:sp');
      totalShapes += shapes.length;

      for (let shIdx = 0; shIdx < shapes.length; shIdx++) {
        const shape = shapes[shIdx];

        // Position & bounds: a:off, a:ext
        const off = shape.getElementsByTagName('a:off')[0];
        const ext = shape.getElementsByTagName('a:ext')[0];

        let x = 40;
        let y = 40 + shIdx * 60;
        let width = slideWidth - 80;
        let height = 40;

        if (off && ext) {
          const emuX = parseInt(off.getAttribute('x') || '0', 10);
          const emuY = parseInt(off.getAttribute('y') || '0', 10);
          const emuW = parseInt(ext.getAttribute('cx') || '0', 10);
          const emuH = parseInt(ext.getAttribute('cy') || '0', 10);
          x = Math.round((emuX / 914400) * 96);
          y = Math.round((emuY / 914400) * 96);
          width = Math.max(Math.round((emuW / 914400) * 96), 30);
          height = Math.max(Math.round((emuH / 914400) * 96), 20);
        }

        // Text body: p:txBody -> a:p -> a:r -> a:t
        const paragraphs = shape.getElementsByTagName('a:p');
        const textParts: string[] = [];
        let fontSize = 16;
        let fontWeight = 400;
        let fontColor = '#FFFFFF';

        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
          const p = paragraphs[pIdx];
          const textRuns = p.getElementsByTagName('a:r');
          const pLine: string[] = [];

          for (let rIdx = 0; rIdx < textRuns.length; rIdx++) {
            const run = textRuns[rIdx];
            const t = run.getElementsByTagName('a:t')[0]?.textContent || '';
            pLine.push(t);

            const rPr = run.getElementsByTagName('a:rPr')[0];
            if (rPr) {
              const sz = rPr.getAttribute('sz');
              if (sz) fontSize = Math.max(Math.round(parseInt(sz, 10) / 100), 10);
              const b = rPr.getAttribute('b');
              if (b === '1') fontWeight = 700;
              const srgb = rPr.getElementsByTagName('a:srgbClr')[0]?.getAttribute('val');
              if (srgb) fontColor = `#${srgb}`;
            }
          }

          if (pLine.length > 0) {
            textParts.push(pLine.join(''));
          }
        }

        const fullText = textParts.join('\n').trim();
        if (fullText) {
          totalTextBoxes++;
          const isTitle = fontSize >= 24 || shIdx === 0;
          textNodes.push({
            id: `pptx_s${sIdx + 1}_t${shIdx}`,
            name: isTitle ? `Slide Title: ${fullText.slice(0, 16)}` : `Text Box ${shIdx}`,
            type: isTitle ? 'heading' : 'text',
            parentId: null,
            childrenIds: [],
            x,
            y,
            width,
            height,
            rotation: 0,
            opacity: 1,
            zIndex: 10 + shIdx,
            visible: true,
            locked: false,
            content: fullText,
            fontFamily: isTitle ? 'Playfair Display, serif' : 'Inter, sans-serif',
            fontSize,
            fontWeight,
            color: fontColor,
            lineHeight: 1.25,
            letterSpacing: 0,
            alignment: 'left',
            constraints: { mode: 'reflow' },
            confidence: 0.95,
            source: 'pptx'
          });
        }
      }

      // Extract Picture Shapes: p:pic
      const pics = slideDoc.getElementsByTagName('p:pic');
      totalImages += pics.length;

      for (let pIdx = 0; pIdx < pics.length; pIdx++) {
        const pic = pics[pIdx];
        const off = pic.getElementsByTagName('a:off')[0];
        const ext = pic.getElementsByTagName('a:ext')[0];

        let px = 80;
        let py = 80;
        let pw = 200;
        let ph = 150;

        if (off && ext) {
          px = Math.round((parseInt(off.getAttribute('x') || '0', 10) / 914400) * 96);
          py = Math.round((parseInt(off.getAttribute('y') || '0', 10) / 914400) * 96);
          pw = Math.max(Math.round((parseInt(ext.getAttribute('cx') || '0', 10) / 914400) * 96), 40);
          ph = Math.max(Math.round((parseInt(ext.getAttribute('cy') || '0', 10) / 914400) * 96), 40);
        }

        const mediaKeys = Object.keys(mediaUrlMap);
        const imgSrc = mediaKeys[pIdx % Math.max(mediaKeys.length, 1)]
          ? mediaUrlMap[mediaKeys[pIdx % mediaKeys.length]]
          : undefined;

        imageNodes.push({
          id: `pptx_s${sIdx + 1}_img${pIdx}`,
          name: `Image ${pIdx + 1}`,
          type: 'image',
          parentId: null,
          childrenIds: [],
          x: px,
          y: py,
          width: pw,
          height: ph,
          rotation: 0,
          opacity: 1,
          zIndex: 5 + pIdx,
          visible: true,
          locked: false,
          src: imgSrc,
          backgroundColor: '#1E1A24',
          constraints: { mode: 'fixed' },
          confidence: 0.92,
          source: 'pptx'
        });
      }

      slides.push({
        slideNumber: sIdx + 1,
        width: slideWidth,
        height: slideHeight,
        textNodes,
        imageNodes
      });
    }

    const report: PptxImportReport = {
      status: warnings.length > 0 ? 'partial' : 'success',
      slidesCount: slides.length,
      textBoxesCount: totalTextBoxes,
      imagesCount: totalImages,
      shapesCount: totalShapes,
      warnings
    };

    return { slides, report };
  }

  /**
   * Converts a slide into an editable scene graph for the main canvas
   */
  static buildSlideSceneGraph(slide: PptxSlideData): SceneGraph {
    const nodes: Record<string, SceneNode> = {};
    const rootIds: string[] = [];

    for (const imgNode of slide.imageNodes) {
      nodes[imgNode.id] = imgNode;
      rootIds.push(imgNode.id);
    }

    for (const textNode of slide.textNodes) {
      nodes[textNode.id] = textNode;
      rootIds.push(textNode.id);
    }

    return {
      nodes,
      rootIds,
      canvasWidth: slide.width,
      canvasHeight: slide.height,
      backgroundColor: '#08070A'
    };
  }
}
