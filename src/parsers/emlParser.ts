/**
 * RECONSTRUCTA — RFC-COMPATIBLE EML & EMAIL PARSER
 * Supports multipart/alternative, multipart/mixed, multipart/related,
 * attachment extraction with Content-ID/filename/size, and strict DOMPurify sanitization.
 */

import DOMPurify from 'dompurify';
import { SceneGraph, SceneNode } from '../types/sceneGraph';

export interface EmailAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId?: string;
  dataUrl?: string;
}

export interface ParsedEmailData {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  messageId?: string;
  subject: string;
  date: string;
  bodyText: string;
  sanitizedHtml?: string;
  attachments: EmailAttachment[];
}

export class EMLParser {
  /**
   * Decodes quoted-printable strings
   */
  private static decodeQuotedPrintable(str: string): string {
    return str
      .replace(/=\r?\n/g, '') // Soft line breaks
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  /**
   * Parses RFC 822 email text into structured data with multipart support
   */
  static parseRawEML(rawContent: string): ParsedEmailData {
    const lines = rawContent.split(/\r?\n/);
    const headers: Record<string, string> = {};
    let isReadingHeaders = true;
    let currentHeaderKey = '';
    const bodyLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isReadingHeaders) {
        if (line.trim() === '') {
          isReadingHeaders = false;
          continue;
        }

        // Header continuation (line starts with space or tab)
        if (/^[ \t]/.test(line) && currentHeaderKey) {
          headers[currentHeaderKey] += ' ' + line.trim();
          continue;
        }

        const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
        if (match) {
          currentHeaderKey = match[1].toLowerCase();
          headers[currentHeaderKey] = match[2].trim();
        }
      } else {
        bodyLines.push(line);
      }
    }

    const rawBody = bodyLines.join('\n');
    const contentTypeHeader = headers['content-type'] || 'text/plain';

    let bodyText = '';
    let rawHtml = '';
    const attachments: EmailAttachment[] = [];

    // Check for Multipart
    const boundaryMatch = contentTypeHeader.match(/boundary="?([^";]+)"?/i);

    if (boundaryMatch && boundaryMatch[1]) {
      const boundary = boundaryMatch[1];
      const parts = rawBody.split(new RegExp(`--${boundary}(?:--)?`));

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const partHeaderSplit = trimmed.split(/\r?\n\r?\n/);
        const partHeaderStr = partHeaderSplit[0] || '';
        const partBodyStr = partHeaderSplit.slice(1).join('\n\n') || '';

        const partHeaders: Record<string, string> = {};
        for (const hLine of partHeaderStr.split(/\r?\n/)) {
          const hm = hLine.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
          if (hm) {
            partHeaders[hm[1].toLowerCase()] = hm[2].trim();
          }
        }

        const partContentType = partHeaders['content-type'] || 'text/plain';
        const contentDisp = partHeaders['content-disposition'] || '';
        const encoding = (partHeaders['content-transfer-encoding'] || '').toLowerCase();

        // Check if attachment
        const isAttachment =
          contentDisp.includes('attachment') ||
          contentDisp.includes('filename=') ||
          partContentType.includes('name=');

        if (isAttachment) {
          const fnMatch =
            contentDisp.match(/filename="?([^";]+)"?/i) || partContentType.match(/name="?([^";]+)"?/i);
          const filename = fnMatch ? fnMatch[1] : 'attachment.dat';
          const mime = partContentType.split(';')[0].trim();
          const cleanBody = partBodyStr.replace(/\s+/g, '');
          const sizeBytes = encoding === 'base64' ? Math.round(cleanBody.length * 0.75) : partBodyStr.length;

          let dataUrl: string | undefined = undefined;
          if (encoding === 'base64') {
            dataUrl = `data:${mime};base64,${cleanBody}`;
          }

          attachments.push({
            filename,
            contentType: mime,
            sizeBytes,
            contentId: partHeaders['content-id']?.replace(/[<>]/g, ''),
            dataUrl
          });
        } else if (partContentType.includes('text/html')) {
          let decoded = partBodyStr;
          if (encoding === 'quoted-printable') {
            decoded = this.decodeQuotedPrintable(partBodyStr);
          } else if (encoding === 'base64') {
            try {
              decoded = atob(partBodyStr.replace(/\s+/g, ''));
            } catch {
              decoded = partBodyStr;
            }
          }
          rawHtml = decoded;
        } else if (partContentType.includes('text/plain') && !bodyText) {
          let decoded = partBodyStr;
          if (encoding === 'quoted-printable') {
            decoded = this.decodeQuotedPrintable(partBodyStr);
          }
          bodyText = decoded;
        }
      }
    } else {
      // Single-part email
      const encoding = (headers['content-transfer-encoding'] || '').toLowerCase();
      let decoded = rawBody;
      if (encoding === 'quoted-printable') {
        decoded = this.decodeQuotedPrintable(rawBody);
      } else if (encoding === 'base64') {
        try {
          decoded = atob(rawBody.replace(/\s+/g, ''));
        } catch {
          decoded = rawBody;
        }
      }

      if (contentTypeHeader.includes('text/html') || /<[a-z][\s\S]*>/i.test(decoded)) {
        rawHtml = decoded;
      } else {
        bodyText = decoded;
      }
    }

    // Strict DOMPurify Sanitization
    let sanitizedHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'b', 'i', 'em', 'strong', 'p', 'br', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
        'table', 'tr', 'td', 'th', 'thead', 'tbody', 'span', 'div', 'a', 'img', 'hr', 'blockquote'
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'meta', 'base'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'formaction'],
      ALLOW_DATA_ATTR: false
    });

    // Resolve inline CID images to embedded attachment data URLs
    for (const att of attachments) {
      if (att.contentId && att.dataUrl) {
        const cleanCid = att.contentId.replace(/[<>]/g, '');
        const cidRegex = new RegExp(`src=["']cid:${cleanCid}["']`, 'gi');
        sanitizedHtml = sanitizedHtml.replace(cidRegex, `src="${att.dataUrl}"`);
      }
    }

    if (!bodyText && sanitizedHtml) {
      const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
      if (tempDiv) {
        tempDiv.innerHTML = sanitizedHtml;
        bodyText = (tempDiv.textContent || tempDiv.innerText || '').trim();
      }
    }

    return {
      from: headers['from'] || 'Unknown Sender',
      to: headers['to'] || 'recipient@example.com',
      cc: headers['cc'],
      bcc: headers['bcc'],
      replyTo: headers['reply-to'],
      messageId: headers['message-id'],
      subject: headers['subject'] || '(No Subject)',
      date: headers['date'] || new Date().toLocaleString(),
      bodyText: bodyText || rawBody.trim(),
      sanitizedHtml: sanitizedHtml || undefined,
      attachments
    };
  }

  /**
   * Builds an editable luxury email scene graph from parsed email data
   */
  static buildEmailSceneGraph(
    email: ParsedEmailData,
    canvasWidth: number = 800,
    canvasHeight: number = 900
  ): SceneGraph {
    const nodes: Record<string, SceneNode> = {};
    const rootIds: string[] = [];

    // 1. Email Client Header Container Card
    const headerCardId = 'email_header_card';
    const headerCardBounds = { x: 32, y: 32, width: canvasWidth - 64, height: email.cc ? 140 : 120 };
    nodes[headerCardId] = {
      id: headerCardId,
      name: 'Email Header Card',
      type: 'shape',
      parentId: null,
      childrenIds: ['email_from', 'email_to', 'email_subject', 'email_date'],
      x: headerCardBounds.x,
      y: headerCardBounds.y,
      width: headerCardBounds.width,
      height: headerCardBounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: false,
      backgroundColor: '#120F16',
      strokeColor: '#D4AF37',
      strokeWidth: 1,
      borderRadius: 8,
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      confidenceLabel: 'HIGH',
      source: 'eml',
      sourceRegion: headerCardBounds,
      confidenceSource: 'eml_mime',
      evidence: { rfcHeadersParsed: Object.keys(email).length },
      detectionMethod: 'RFC 822 header extraction',
      reconstructionStatus: 'native',
      limitations: []
    };
    rootIds.push(headerCardId);

    // From Node
    const fromBounds = { x: 48, y: 46, width: canvasWidth - 96, height: 22 };
    nodes['email_from'] = {
      id: 'email_from',
      name: 'Sender',
      type: 'name',
      parentId: headerCardId,
      childrenIds: [],
      x: fromBounds.x,
      y: fromBounds.y,
      width: fromBounds.width,
      height: fromBounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      visible: true,
      locked: false,
      content: `From: ${email.from}`,
      fontFamily: 'Inter, sans-serif',
      fontSize: 13.5,
      fontWeight: 600,
      color: '#F4EFE6',
      lineHeight: 1.25,
      alignment: 'left',
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      confidenceLabel: 'HIGH',
      source: 'eml',
      sourceRegion: fromBounds,
      confidenceSource: 'eml_mime',
      detectionMethod: 'RFC 822 From header parser',
      reconstructionStatus: 'native',
      limitations: []
    };

    // To Node
    const toBounds = { x: 48, y: 70, width: canvasWidth - 96, height: 20 };
    nodes['email_to'] = {
      id: 'email_to',
      name: 'Recipient',
      type: 'email',
      parentId: headerCardId,
      childrenIds: [],
      x: toBounds.x,
      y: toBounds.y,
      width: toBounds.width,
      height: toBounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      visible: true,
      locked: false,
      content: `To: ${email.to}${email.cc ? ` | Cc: ${email.cc}` : ''}`,
      fontFamily: 'Inter, sans-serif',
      fontSize: 12,
      fontWeight: 400,
      color: '#A098A8',
      lineHeight: 1.25,
      alignment: 'left',
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      confidenceLabel: 'HIGH',
      source: 'eml',
      sourceRegion: toBounds,
      confidenceSource: 'eml_mime',
      detectionMethod: 'RFC 822 To/Cc header parser',
      reconstructionStatus: 'native',
      limitations: []
    };

    // Subject Node
    const subjectBounds = { x: 48, y: 96, width: canvasWidth - 96, height: 26 };
    nodes['email_subject'] = {
      id: 'email_subject',
      name: 'Subject',
      type: 'heading',
      parentId: headerCardId,
      childrenIds: [],
      x: subjectBounds.x,
      y: subjectBounds.y,
      width: subjectBounds.width,
      height: subjectBounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      visible: true,
      locked: false,
      content: email.subject,
      fontFamily: 'Playfair Display, serif',
      fontSize: 17,
      fontWeight: 700,
      color: '#D4AF37',
      lineHeight: 1.25,
      alignment: 'left',
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      confidenceLabel: 'HIGH',
      source: 'eml',
      sourceRegion: subjectBounds,
      confidenceSource: 'eml_mime',
      detectionMethod: 'RFC 822 Subject header parser',
      reconstructionStatus: 'native',
      limitations: []
    };

    // Date Node
    const dateBounds = { x: canvasWidth - 230, y: 46, width: 180, height: 20 };
    nodes['email_date'] = {
      id: 'email_date',
      name: 'Date',
      type: 'timestamp',
      parentId: headerCardId,
      childrenIds: [],
      x: dateBounds.x,
      y: dateBounds.y,
      width: dateBounds.width,
      height: dateBounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      visible: true,
      locked: false,
      content: email.date,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10.5,
      fontWeight: 400,
      color: '#D4AF37',
      alignment: 'right',
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      confidenceLabel: 'HIGH',
      source: 'eml',
      sourceRegion: dateBounds,
      confidenceSource: 'eml_mime',
      detectionMethod: 'RFC 822 Date header parser',
      reconstructionStatus: 'native',
      limitations: []
    };

    let bodyStartY = (email.cc ? 140 : 120) + 48;

    // 2. Attachments Section Pills (if any)
    if (email.attachments.length > 0) {
      const attCardId = 'email_attachments_bar';
      const attCardBounds = { x: 32, y: bodyStartY, width: canvasWidth - 64, height: 38 };
      nodes[attCardId] = {
        id: attCardId,
        name: `Attachments (${email.attachments.length})`,
        type: 'shape',
        parentId: null,
        childrenIds: [],
        x: attCardBounds.x,
        y: attCardBounds.y,
        width: attCardBounds.width,
        height: attCardBounds.height,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        visible: true,
        locked: false,
        backgroundColor: 'rgba(212, 175, 55, 0.08)',
        strokeColor: 'rgba(212, 175, 55, 0.3)',
        strokeWidth: 1,
        borderRadius: 6,
        constraints: { mode: 'fixed' },
        confidence: 1.0,
        confidenceLabel: 'HIGH',
        source: 'eml',
        sourceRegion: attCardBounds,
        confidenceSource: 'eml_mime',
        evidence: { attachmentCount: email.attachments.length },
        detectionMethod: 'MIME multipart attachment extractor',
        reconstructionStatus: 'native',
        limitations: []
      };
      rootIds.push(attCardId);

      const attText = email.attachments
        .map((a) => `${a.filename} (${Math.round(a.sizeBytes / 1024)} KB)`)
        .join('  •  ');

      const attLabelBounds = { x: 46, y: bodyStartY + 10, width: canvasWidth - 92, height: 20 };
      nodes['email_attachments_label'] = {
        id: 'email_attachments_label',
        name: 'Attachment Labels',
        type: 'text',
        parentId: attCardId,
        childrenIds: [],
        x: attLabelBounds.x,
        y: attLabelBounds.y,
        width: attLabelBounds.width,
        height: attLabelBounds.height,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        visible: true,
        locked: false,
        content: `📎 ${attText}`,
        fontFamily: 'Inter, sans-serif',
        fontSize: 11.5,
        fontWeight: 500,
        color: '#D4AF37',
        lineHeight: 1.2,
        alignment: 'left',
        constraints: { mode: 'fixed' },
        confidence: 1.0,
        confidenceLabel: 'HIGH',
        source: 'eml',
        sourceRegion: attLabelBounds,
        confidenceSource: 'eml_mime',
        detectionMethod: 'MIME header parsing',
        reconstructionStatus: 'native',
        limitations: []
      };
      rootIds.push('email_attachments_label');

      bodyStartY += 48;
    }

    // 3. Email Body Container
    const bodyCardId = 'email_body_card';
    const bodyHeight = Math.max(canvasHeight - bodyStartY - 32, 400);
    const bodyBounds = { x: 32, y: bodyStartY, width: canvasWidth - 64, height: bodyHeight };

    nodes[bodyCardId] = {
      id: bodyCardId,
      name: 'Email Body Card',
      type: 'shape',
      parentId: null,
      childrenIds: ['email_body_text'],
      x: bodyBounds.x,
      y: bodyBounds.y,
      width: bodyBounds.width,
      height: bodyBounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visible: true,
      locked: false,
      backgroundColor: '#0F0D14',
      strokeColor: '#241337',
      strokeWidth: 1,
      borderRadius: 8,
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      confidenceLabel: 'HIGH',
      source: 'eml',
      sourceRegion: bodyBounds,
      confidenceSource: 'eml_mime',
      detectionMethod: 'Email body container frame',
      reconstructionStatus: 'native',
      limitations: []
    };
    rootIds.push(bodyCardId);

    // Email Body Text Node
    const bodyTextBounds = { x: 48, y: bodyStartY + 16, width: canvasWidth - 96, height: bodyHeight - 32 };
    nodes['email_body_text'] = {
      id: 'email_body_text',
      name: 'Email Content',
      type: 'message',
      parentId: bodyCardId,
      childrenIds: [],
      x: bodyTextBounds.x,
      y: bodyTextBounds.y,
      width: bodyTextBounds.width,
      height: bodyTextBounds.height,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      visible: true,
      locked: false,
      content: email.bodyText,
      fontFamily: 'Inter, sans-serif',
      fontSize: 13.5,
      fontWeight: 400,
      color: '#F4EFE6',
      lineHeight: 1.45,
      alignment: 'left',
      constraints: { mode: 'reflow' },
      confidence: 1.0,
      confidenceLabel: 'HIGH',
      source: 'eml',
      sourceRegion: bodyTextBounds,
      confidenceSource: 'eml_mime',
      evidence: {
        bodyLengthChars: email.bodyText.length,
        hasHtml: !!email.sanitizedHtml
      },
      detectionMethod: 'RFC 822 MIME body decode & DOMPurify sanitizer',
      reconstructionStatus: 'native',
      limitations: []
    };

    return {
      nodes,
      rootIds,
      canvasWidth,
      canvasHeight: Math.max(bodyStartY + bodyHeight + 48, canvasHeight),
      backgroundColor: '#08070A'
    };
  }
}
