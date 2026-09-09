/**
 * RECONSTRUCTA — SECURE FILE DETECTOR & VALIDATOR
 * Verifies magic bytes, MIME types, file sizes, and prevents path traversal / malformed payload injection.
 */

export interface FileValidationResult {
  valid: boolean;
  fileType: 'image' | 'pdf' | 'eml' | 'docx' | 'pptx' | 'reconstructa' | 'unknown';
  mimeType: string;
  sizeBytes: number;
  error?: string;
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB safety limit

export class FileDetector {
  /**
   * Validates file size and inspects magic byte signatures
   */
  static async validateFile(file: File): Promise<FileValidationResult> {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        fileType: 'unknown',
        mimeType: file.type,
        sizeBytes: file.size,
        error: `File exceeds the 50MB security limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`
      };
    }

    // Read first 16 bytes for magic signature detection
    const buffer = await file.slice(0, 16).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    // 1. PDF Check: %PDF- (0x25, 0x50, 0x44, 0x46)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return {
        valid: true,
        fileType: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: file.size
      };
    }

    // 2. PNG Check: 0x89, 0x50, 0x4E, 0x47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return {
        valid: true,
        fileType: 'image',
        mimeType: 'image/png',
        sizeBytes: file.size
      };
    }

    // 3. JPEG Check: 0xFF, 0xD8, 0xFF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return {
        valid: true,
        fileType: 'image',
        mimeType: 'image/jpeg',
        sizeBytes: file.size
      };
    }

    // 4. WebP Check: RIFF....WEBP
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      return {
        valid: true,
        fileType: 'image',
        mimeType: 'image/webp',
        sizeBytes: file.size
      };
    }

    // 5. ZIP-based OpenXML: PK.. (0x50, 0x4B, 0x03, 0x04) -> DOCX or PPTX
    if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
      if (ext === 'docx') {
        return {
          valid: true,
          fileType: 'docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sizeBytes: file.size
        };
      }
      if (ext === 'pptx') {
        return {
          valid: true,
          fileType: 'pptx',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          sizeBytes: file.size
        };
      }
    }

    // 6. EML or HTML Text File
    if (ext === 'eml' || file.type === 'message/rfc822') {
      return {
        valid: true,
        fileType: 'eml',
        mimeType: 'message/rfc822',
        sizeBytes: file.size
      };
    }

    if (ext === 'reconstructa' || file.name.endsWith('.reconstructa.json')) {
      return {
        valid: true,
        fileType: 'reconstructa',
        mimeType: 'application/json',
        sizeBytes: file.size
      };
    }

    // Fallback for image MIME types
    if (file.type.startsWith('image/')) {
      return {
        valid: true,
        fileType: 'image',
        mimeType: file.type,
        sizeBytes: file.size
      };
    }

    return {
      valid: false,
      fileType: 'unknown',
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      error: `Unsupported file format (.${ext}). Supported formats: PNG, JPG, WebP, PDF, EML, DOCX, PPTX.`
    };
  }

  /**
   * Sanitizes filenames to prevent directory traversal
   */
  static sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}
