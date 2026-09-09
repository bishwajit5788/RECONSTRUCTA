/**
 * RECONSTRUCTA — PROJECT & VERSIONING DATA MODELS
 */

import { SceneGraph } from './sceneGraph';
import { PlatformId } from './platform';

export interface ProjectVersion {
  versionId: string;
  versionNumber: number;
  name: string;
  timestamp: number;
  thumbnailUrl?: string;
  sceneGraphSnapshot: SceneGraph;
}

export interface ProjectAsset {
  id: string;
  name: string;
  type: 'image' | 'avatar' | 'icon' | 'background' | 'document';
  mimeType: string;
  dataUrl: string;
  createdAt: number;
  sizeBytes: number;
}

export interface ReconstructaProject {
  schemaVersion: number; // For migrations (e.g. 1)
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  platform: PlatformId;
  sceneGraph: SceneGraph;
  assets: Record<string, ProjectAsset>;
  versions: ProjectVersion[];
  provenance: {
    origin: 'user_import' | 'scratch';
    importedFileType?: string;
    hasWatermarkEnabled: boolean;
    watermarkText: string;
    watermarkPosition: 'bottom-right' | 'bottom-left' | 'top-right';
  };
}

export interface ExportConfig {
  format: 'png' | 'jpeg' | 'webp' | 'pdf';
  quality: number; // 0.1 - 1.0
  scale: number;   // 1, 2, 3
  includeWatermark: boolean;
  watermarkText: string;
}
