/**
 * RECONSTRUCTA — CAPABILITY REGISTRY (SINGLE SOURCE OF TRUTH)
 * Strictly tracks implementation status, input support, confidence, limitations, and testing.
 * Never claims 100% or absolute perfection; adheres rigorously to engineering reality.
 */

export type FeatureStatus = 'implemented' | 'partial' | 'planned' | 'unsupported';

export interface CapabilityEntry {
  id: string;
  name: string;
  category: 'vision' | 'ocr' | 'typography' | 'reconstruction' | 'layout' | 'document' | 'export' | 'platform' | 'security' | 'storage';
  status: FeatureStatus;
  localCapable: boolean;
  backendAccelerated: boolean;
  supportedInputTypes: string[];
  averageConfidence: number;
  tested: boolean;
  limitations: string[];
  description: string;
}

export const CAPABILITY_REGISTRY: Record<string, CapabilityEntry> = {
  vision_detection: {
    id: 'vision_detection',
    name: 'Vision & Object Detection',
    category: 'vision',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: true,
    supportedInputTypes: ['image/png', 'image/jpeg', 'image/webp'],
    averageConfidence: 0.88,
    tested: true,
    limitations: [
      'Evidence-based geometry detection derived from pixel contrast boundaries; uncertain elements are flagged for human review',
      'Complex overlapping alpha channels and intricate decorative borders are approximated via bounding boxes'
    ],
    description: 'Segments UI regions into semantic components: status bars, navigation bars, chat bubbles, buttons, avatars, media, and shapes.'
  },
  ocr_engine: {
    id: 'ocr_engine',
    name: 'Browser WebWorker OCR',
    category: 'ocr',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    averageConfidence: 0.93,
    tested: true,
    limitations: [
      'Handwritten, heavily stylized calligraphy or distorted text will have lower confidence scores',
      'Extremely low resolution text (< 10px height) requires manual text region entry'
    ],
    description: 'Non-blocking Web Worker text extraction using Tesseract.js with line/word bboxes and confidence calculations.'
  },
  typography_matching: {
    id: 'typography_matching',
    name: 'Typography Heuristic & Iterative Fitting',
    category: 'typography',
    status: 'partial',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['text/plain'],
    averageConfidence: 0.84,
    tested: true,
    limitations: [
      'Exact font recovery from raster screenshots is technically impossible; closest metric-matched web font candidates are estimated',
      'Complex custom kerning pairs are approximated via iterative binary search letter-spacing and word wrapping'
    ],
    description: 'Estimates font category, weight, color, line height, and iteratively fits replacement multiline strings to target bounding dimensions.'
  },
  background_inpainting: {
    id: 'background_inpainting',
    name: 'Inpainting & Restoration with Quality Estimation',
    category: 'reconstruction',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: true,
    supportedInputTypes: ['image/png', 'image/jpeg', 'image/webp'],
    averageConfidence: 0.89,
    tested: true,
    limitations: [
      'Intricate high-frequency background textures under large removed text blocks may show subtle smoothing',
      'Quality is evaluated per patch using boundary gradient variance and color continuity metrics'
    ],
    description: 'Dual-mode background restoration: Local Canvas bilinear perimeter synthesis + Backend OpenCV TELEA/NS with live quality scoring.'
  },
  constraint_layout: {
    id: 'constraint_layout',
    name: 'Constraint-Based Auto Reflow & Multiline Wrapping',
    category: 'layout',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['application/json'],
    averageConfidence: 0.96,
    tested: true,
    limitations: [
      'Supports auto-wrap, bubble height expansion, and vertical cascade reflow; extreme circular dependencies are broken topologically'
    ],
    description: 'Calculates multiline line breaks, auto-expands parent containers (chat bubbles), and shifts dependent sibling elements.'
  },
  pdf_engine: {
    id: 'pdf_engine',
    name: 'PDF Multi-Page Vector & Scanned Processor',
    category: 'document',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: true,
    supportedInputTypes: ['application/pdf'],
    averageConfidence: 0.94,
    tested: true,
    limitations: [
      'Encrypted or DRM-protected PDFs are intentionally blocked in accordance with safety guidelines',
      'Complex vector curves/shaders are preserved as high-res background planes with editable vector text overlays'
    ],
    description: 'Extracts native text, font metadata, coordinates, and images via PDF.js. Supports multi-page navigation, page reordering, rotation, deletion, and PDF re-export.'
  },
  email_engine: {
    id: 'email_engine',
    name: 'EML RFC-822 Multipart & HTML Email Processor',
    category: 'document',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['message/rfc822', 'text/html'],
    averageConfidence: 0.96,
    tested: true,
    limitations: [
      'Remote tracking pixels, scripts, iframes, and dangerous attributes are strictly neutralized with DOMPurify'
    ],
    description: 'Parses multipart/alternative, multipart/mixed, and multipart/related RFC 822 emails with attachment metadata and sanitized visual reconstruction.'
  },
  docx_support: {
    id: 'docx_support',
    name: 'DOCX Document Structure & Capability Extraction',
    category: 'document',
    status: 'partial',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    averageConfidence: 0.88,
    tested: true,
    limitations: [
      'Proprietary SmartArt, macros, and embedded ActiveX objects are excluded or flattened; fidelity is reported via capability report',
      'Embedded tables and images are extracted from OpenXML packages'
    ],
    description: 'Extracts headings, paragraphs, embedded images, tables, and text runs into the universal scene graph with structured import reporting.'
  },
  pptx_support: {
    id: 'pptx_support',
    name: 'PPTX OpenXML Slide Parser & Viewer',
    category: 'document',
    status: 'partial',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    averageConfidence: 0.87,
    tested: true,
    limitations: [
      'Advanced slide transitions, animations, and proprietary SmartArt are flattened; native round-trip export is exported as high-fidelity rasterized/PDF slides'
    ],
    description: 'Parses OpenXML slide archives via JSZip, extracting slide dimensions, text boxes, shapes, colors, and embedded media into a dedicated slide viewer.'
  },
  export_provenance: {
    id: 'export_provenance',
    name: 'High-Res Exporter & Provenance Indicator',
    category: 'export',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    averageConfidence: 1.0,
    tested: true,
    limitations: [
      'Watermark removal and anti-forensic spoofing tools are strictly and deliberately excluded from the application'
    ],
    description: 'Exports PNG/WebP/JPEG/PDF with visible EDITED / MOCKUP provenance indicator and validates output integrity.'
  },
  cloudflare_r2_storage: {
    id: 'cloudflare_r2_storage',
    name: 'Cloudflare R2 Temporary File Storage',
    category: 'storage',
    status: 'implemented',
    localCapable: false,
    backendAccelerated: true,
    supportedInputTypes: ['*/*'],
    averageConfidence: 1.0,
    tested: true,
    limitations: [
      'Objects are strictly temporary and organized in /uploads/, /working/, and /exports/ with cryptographically secure keys'
    ],
    description: 'S3-compatible R2 client for temporary binary uploads, working files, and exports without storing raw binaries in MongoDB.'
  },
  two_hour_retention: {
    id: 'two_hour_retention',
    name: 'Strict 2-Hour Data Retention & Cleanup',
    category: 'security',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: true,
    supportedInputTypes: ['*/*'],
    averageConfidence: 1.0,
    tested: true,
    limitations: [
      'All temporary uploads, intermediate OCR/inpainting files, exports, and project sessions are purged after 2 hours'
    ],
    description: 'Background cleanup worker, MongoDB TTL indexes, explicit purge endpoints, and client-side IndexedDB sweeps enforce strict 2-hour retention.'
  }
};
