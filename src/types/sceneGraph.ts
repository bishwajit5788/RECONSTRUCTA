/**
 * RECONSTRUCTA — SCENE GRAPH & LAYER DATA MODEL
 * Represents all editable elements in the non-destructive canvas engine.
 */

export type ElementType =
  | 'text'
  | 'heading'
  | 'name'
  | 'email'
  | 'timestamp'
  | 'message'
  | 'image'
  | 'avatar'
  | 'icon'
  | 'button'
  | 'shape'
  | 'table'
  | 'chart'
  | 'link'
  | 'checkbox'
  | 'radio'
  | 'header'
  | 'footer'
  | 'status-bar'
  | 'navigation-bar'
  | 'background'
  | 'media'
  | 'QR'
  | 'barcode'
  | 'annotation'
  | 'reaction'
  | 'badge'
  | 'divider'
  | 'input';

export type LayoutMode = 'fixed' | 'auto' | 'reflow' | 'anchor';

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export type MaskShape = 'none' | 'circle' | 'rounded' | 'squircle';

export type ElementSource = 'ocr' | 'vision' | 'pdf' | 'eml' | 'docx' | 'pptx' | 'manual';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InpaintPatch {
  originalDataUrl?: string;
  restoredDataUrl?: string;
  qualityScore: number; // 0.0 - 1.0
  qualityLabel: 'excellent' | 'good' | 'acceptable' | 'poor' | 'failed';
  algorithmUsed: 'local_canvas' | 'opencv_telea' | 'opencv_ns';
  warnings?: string[];
}

export interface LayoutConstraints {
  mode: LayoutMode;
  anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  dependsOn?: string[]; // IDs of elements this node depends on (e.g. bubble depends on text)
  flowOrder?: number;
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
}

export type ConfidenceSource = 'tesseract' | 'heuristics' | 'direct_pdf_stream' | 'docx_xml' | 'eml_mime' | 'manual';

export type ReconstructionStatus = 'native' | 'reconstructed' | 'approximated' | 'flattened';

export interface SceneNode {
  id: string;
  name: string;
  type: ElementType;
  parentId: string | null;
  childrenIds: string[];

  // Spatial / Transform
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  opacity: number;  // 0 - 1
  zIndex: number;
  visible: boolean;
  locked: boolean;

  // Text & Typography
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  color?: string; // Hex or rgba
  backgroundColor?: string;
  lineHeight?: number;
  letterSpacing?: number;
  alignment?: TextAlignment;
  baseline?: number;

  // Shapes & Borders
  strokeColor?: string;
  strokeWidth?: number;
  borderRadius?: number;
  shadow?: {
    x: number;
    y: number;
    blur: number;
    color: string;
  };

  // Image & Media
  src?: string;
  mask?: MaskShape;
  aspectRatioLocked?: boolean;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Restoration & Inpainting
  inpaintPatch?: InpaintPatch;

  // Constraints & Dynamic Reflow
  constraints: LayoutConstraints;

  // Platform & Semantic Details
  platformHint?: string;
  semanticRole?: string;
  confidence: number; // 0.0 - 1.0
  confidenceLabel?: 'HIGH' | 'MEDIUM' | 'LOW';
  reviewRequired?: boolean;
  source: ElementSource;

  // Source Traceability & Evidence (Honest Provenance)
  sourceRegion?: BoundingBox;
  confidenceSource?: ConfidenceSource;
  evidence?: Record<string, number | string | boolean>;
  detectionMethod?: string;
  reconstructionStatus?: ReconstructionStatus;
  limitations?: string[];

  customData?: Record<string, any>;
}

export interface SceneGraph {
  nodes: Record<string, SceneNode>;
  rootIds: string[];
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  backgroundImageUrl?: string;
  originalImageUrl?: string;
}
