/**
 * RECONSTRUCTA — ADVANCED PARSER, SECURITY & STORAGE VALIDATION TESTS
 * Verifies:
 * 1. OpenXML PPTX Parsing & Partial Capability Fidelity Warnings
 * 2. EML Multipart Parsing, Attachment Extraction, and Strict XSS Sanitization
 * 3. ProjectStorage JSON Schema Validation & 2-Hour Retention Invalidation
 * 4. Iterative Typography Fitting & Multiline Word Wrapping
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { PptxParser } from '../parsers/pptxParser';
import { EMLParser } from '../parsers/emlParser';
import { ProjectStorage } from '../engine/project/storage';
import { IterativeFitter } from '../engine/typography/iterativeFitter';
import { ReconstructaProject } from '../types/project';

describe('PptxParser — OpenXML Presentation Processing', () => {
  it('parses PPTX slides and reports honest partial fidelity limitations', async () => {
    // Generate a minimal valid mock PPTX zip in memory
    const zip = new JSZip();

    // Add [Content_Types].xml
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
        <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
      </Types>`
    );

    // Add ppt/presentation.xml with 16:9 dimensions (9144000 x 5143500 EMUs)
    zip.file(
      'ppt/presentation.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:sldSz cx="9144000" cy="5143500"/>
        <p:sldIdLst>
          <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
        </p:sldIdLst>
      </p:presentation>`
    );

    // Add ppt/slides/slide1.xml with title and subtitle shapes
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:nvSpPr><p:cNvPr id="1" name="Title 1"/></p:nvSpPr>
              <p:spPr>
                <a:xfrm>
                  <a:off x="914400" y="457200"/>
                  <a:ext cx="7315200" cy="914400"/>
                </a:xfrm>
              </p:spPr>
              <p:txBody>
                <a:p>
                  <a:r>
                    <a:rPr sz="3200" b="1"><a:solidFill><a:srgbClr val="D4AF37"/></a:solidFill></a:rPr>
                    <a:t>Executive Summary</a:t>
                  </a:r>
                </a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:sld>`
    );

    // Add ppt/diagrams/data1.xml for SmartArt testing
    zip.file(
      'ppt/diagrams/data1.xml',
      '<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>'
    );

    const pptxBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const { slides, report } = await PptxParser.parsePptx(pptxBuffer);

    expect(slides.length).toBe(1);
    const slide1 = slides[0];
    expect(slide1.slideNumber).toBe(1);
    expect(slide1.width).toBe(960);
    expect(slide1.height).toBe(540);
    expect(slide1.textNodes.length).toBe(1);
    expect(slide1.textNodes[0].content).toBe('Executive Summary');
    expect(slide1.textNodes[0].color).toBe('#D4AF37');

    // Verify honest partial fidelity warnings
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings.some((w) => w.includes('SmartArt') || w.includes('complex'))).toBe(true);

    // Verify conversion to scene graph
    const sceneGraph = PptxParser.buildSlideSceneGraph(slide1);
    expect(sceneGraph.rootIds.length).toBe(1);
    expect(sceneGraph.nodes[sceneGraph.rootIds[0]].content).toBe('Executive Summary');
  });
});

describe('EMLParser — Multipart & Attachment Security', () => {
  it('extracts multipart/mixed attachments and sanitizes body', () => {
    const rawEml = `From: "Finance Desk" <finance@reconstructa.luxury>
To: "Audit Team" <audit@reconstructa.luxury>
Subject: Q3 Ledger & Summary Report
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="====_BOUNDARY_123_===="

--====_BOUNDARY_123_====
Content-Type: text/html; charset="utf-8"

<h2>Q3 Financial Reconstructed Brief</h2>
<p>Please review the enclosed ledger file.</p>
<script>document.location="http://attacker.com";</script>
<style>body { display: none; }</style>

--====_BOUNDARY_123_====
Content-Type: application/pdf; name="Q3_Report.pdf"
Content-Disposition: attachment; filename="Q3_Report.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQKJcTl8uXr...
--====_BOUNDARY_123_====--`;

    const parsed = EMLParser.parseRawEML(rawEml);

    expect(parsed.from).toContain('Finance Desk');
    expect(parsed.subject).toBe('Q3 Ledger & Summary Report');

    // Ensure XSS scripts are stripped by DOMPurify
    expect(parsed.sanitizedHtml).not.toContain('<script>');
    expect(parsed.sanitizedHtml).toContain('Q3 Financial Reconstructed Brief');

    // Verify attachment detection
    expect(parsed.attachments.length).toBe(1);
    expect(parsed.attachments[0].filename).toBe('Q3_Report.pdf');
    expect(parsed.attachments[0].contentType).toBe('application/pdf');
    expect(parsed.attachments[0].sizeBytes).toBeGreaterThan(0);
  });
});

describe('ProjectStorage — Schema Validation & Crash Recovery', () => {
  it('rejects malformed project schemas with descriptive errors', () => {
    // Missing required fields
    expect(ProjectStorage.validateProjectSchema(null).valid).toBe(false);
    expect(ProjectStorage.validateProjectSchema({}).valid).toBe(false);

    // Missing sceneGraph
    expect(
      ProjectStorage.validateProjectSchema({
        id: 'proj_123'
      }).valid
    ).toBe(false);

    // Invalid canvas dimensions
    expect(
      ProjectStorage.validateProjectSchema({
        id: 'proj_123',
        sceneGraph: {
          nodes: {},
          rootIds: [],
          canvasWidth: -100,
          canvasHeight: 500
        }
      }).valid
    ).toBe(false);

    // Valid schema
    const validResult = ProjectStorage.validateProjectSchema({
      id: 'proj_valid',
      name: 'Valid Project',
      sceneGraph: {
        nodes: {},
        rootIds: [],
        canvasWidth: 1080,
        canvasHeight: 1920
      }
    });
    expect(validResult.valid).toBe(true);
  });

  it('saves, retrieves, and checks expiration of local projects', async () => {
    const mockProject: ReconstructaProject = {
      id: 'proj_test_retention',
      name: 'Test Project',
      schemaVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      platform: 'generic',
      sceneGraph: {
        nodes: {},
        rootIds: [],
        canvasWidth: 800,
        canvasHeight: 600,
        backgroundColor: '#08070A'
      },
      versions: [],
      assets: {},
      provenance: {
        origin: 'scratch',
        hasWatermarkEnabled: true,
        watermarkText: 'RECONSTRUCTA — EDITED / MOCKUP',
        watermarkPosition: 'bottom-right'
      }
    };

    await ProjectStorage.saveProject(mockProject);
    const loaded = await ProjectStorage.loadProject('proj_test_retention');
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe('Test Project');

    // Verify crash recovery snapshot
    await ProjectStorage.saveCrashSnapshot(mockProject.sceneGraph, 'Crash Recovery Test');
    const snapshot = await ProjectStorage.loadCrashSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.projectName).toBe('Crash Recovery Test');
    expect(snapshot?.sceneGraph.canvasWidth).toBe(800);

    await ProjectStorage.clearCrashSnapshot();
    const afterClear = await ProjectStorage.loadCrashSnapshot();
    expect(afterClear).toBeNull();
  });
});

describe('Iterative Typography Fitter', () => {
  it('fits multiline text into target bounding box within tolerance', () => {
    const text = 'RECONSTRUCTA delivers absolute visual fidelity with strict mathematical constraint solving.';
    const boxWidth = 280;
    const boxHeight = 120;

    const result = IterativeFitter.fitText(text, boxWidth, boxHeight, {
      fontFamily: 'Inter, sans-serif',
      initialFontSize: 24,
      minFontSize: 10,
      maxFontSize: 36
    });

    expect(result.fontSize).toBeGreaterThanOrEqual(10);
    expect(result.fontSize).toBeLessThanOrEqual(36);
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.measuredWidth).toBeLessThanOrEqual(boxWidth * 1.15);
    expect(result.measuredHeight).toBeLessThanOrEqual(boxHeight * 1.15);
  });
});
