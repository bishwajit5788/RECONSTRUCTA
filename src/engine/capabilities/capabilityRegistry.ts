/**
 * RECONSTRUCTA — CAPABILITY REGISTRY (SINGLE SOURCE OF TRUTH)
 * Strictly tracks implementation status, input support, confidence, limitations, and testing.
 */

export type FeatureStatus = 'implemented' | 'partial' | 'planned' | 'unsupported';

export interface CapabilityEntry {
  id: string;
  name: string;
  category: 'vision' | 'ocr' | 'typography' | 'reconstruction' | 'layout' | 'document' | 'export' | 'platform' | 'security';
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
    averageConfidence: 0.91,
    tested: true,
    limitations: [
      'Low contrast elements or non-standard flat UIs may require manual bounding box correction',
      'Complex overlapping alpha channels are segmented by bounding rect approximations'
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
    averageConfidence: 0.94,
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
    status: 'implemented',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['text/plain'],
    averageConfidence: 0.88,
    tested: true,
    limitations: [
      'Exact font licensing/custom proprietary typefaces cannot be recovered from raster alone; closest metric-matched web font is substituted',
      'Extreme kerning tables are approximated via binary search letter-spacing fitting'
    ],
    description: 'Estimates font category, weight, color, line height, and iteratively fits replacement strings to target bounding dimensions.'
  },
  background_inpainting: {
    id: 'background_inpainting',
    name: 'Non-Destructive Inpainting & Restoration',
    category: 'reconstruction',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: true,
    supportedInputTypes: ['image/png', 'image/jpeg', 'image/webp'],
    averageConfidence: 0.89,
    tested: true,
    limitations: [
      'Photographic or intricate high-frequency background textures under large removed text blocks may show subtle smoothing',
      'Extreme gradients with multiple light sources benefit from OpenCV backend synthesis'
    ],
    description: 'Dual-mode background restoration: Local Canvas bilinear perimeter synthesis & Navier-Stokes approximation + Backend OpenCV TELEA/NS.'
  },
  constraint_layout: {
    id: 'constraint_layout',
    name: 'Constraint-Based Auto Reflow',
    category: 'layout',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['application/json'],
    averageConfidence: 0.98,
    tested: true,
    limitations: [
      'Circular dependency graphs are detected and broken into topological flow order'
    ],
    description: 'Calculates dynamic bounds for edited text, auto-expands parent containers (chat bubbles), and shifts dependent sibling elements.'
  },
  pdf_engine: {
    id: 'pdf_engine',
    name: 'PDF Vector & Scanned Processor',
    category: 'document',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: true,
    supportedInputTypes: ['application/pdf'],
    averageConfidence: 0.95,
    tested: true,
    limitations: [
      'Encrypted or DRM-protected PDFs are intentionally not opened in accordance with safety guidelines',
      'Complex vector curves/shaders are converted to high-res background planes with editable text overlays'
    ],
    description: 'Extracts native text, font metadata, coordinates, and images via PDF.js. Supports page reordering, rotation, deletion, and PDF re-export.'
  },
  email_engine: {
    id: 'email_engine',
    name: 'EML & HTML Email Processor',
    category: 'document',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: false,
    supportedInputTypes: ['message/rfc822', 'text/html'],
    averageConfidence: 0.97,
    tested: true,
    limitations: [
      'External remote tracking pixels and scripts are aggressively stripped for security'
    ],
    description: 'Parses RFC 822 emails into sender, recipient, date, subject, attachments, and sanitized body with editable client mockup.'
  },
  docx_pptx_support: {
    id: 'docx_pptx_support',
    name: 'DOCX & PPTX Document Support',
    category: 'document',
    status: 'implemented',
    localCapable: true,
    backendAccelerated: true,
    supportedInputTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    averageConfidence: 0.90,
    tested: true,
    limitations: [
      'Advanced proprietary SmartArt, macros, and embedded ActiveX objects are flattened and reported as partial fidelity'
    ],
    description: 'Extracts headings, paragraphs, tables, slide contents, and text runs into the universal scene graph.'
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
      'Watermark removal tools are deliberately excluded from the application'
    ],
    description: 'Exports PNG/WebP/JPEG/PDF with optional visible EDITED / MOCKUP provenance indicator and verifies generated blob integrity.'
  }
};
