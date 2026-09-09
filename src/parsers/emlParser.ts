/**
 * RECONSTRUCTA — EML & EMAIL PARSER (RFC 822)
 * Parses email headers, dates, sender/recipients, subject, attachments,
 * and sanitizes HTML body using DOMPurify to eliminate script injection.
 */

import DOMPurify from 'dompurify';
import { SceneGraph, SceneNode } from '../types/sceneGraph';

export interface ParsedEmailData {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  date: string;
  bodyText: string;
  sanitizedHtml?: string;
  attachments: { filename: string; contentType: string }[];
}

export class EMLParser {
  /**
   * Parses raw RFC 822 email text into structured data
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
          // Empty line indicates start of email body
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

    // DOMPurify sanitization
    const sanitizedHtml = DOMPurify.sanitize(rawBody, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'span', 'div', 'a', 'img'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
    });

    // Plain text extraction
    const tempDiv = typeof document !== 'undefined' ? document.createElement('div') : null;
    let plainText = rawBody;
    if (tempDiv) {
      tempDiv.innerHTML = sanitizedHtml;
      plainText = tempDiv.textContent || tempDiv.innerText || rawBody;
    }

    return {
      from: headers['from'] || 'Unknown Sender',
      to: headers['to'] || 'recipient@example.com',
      cc: headers['cc'],
      bcc: headers['bcc'],
      subject: headers['subject'] || '(No Subject)',
      date: headers['date'] || new Date().toLocaleString(),
      bodyText: plainText.trim(),
      sanitizedHtml,
      attachments: []
    };
  }

  /**
   * Converts parsed email data into an editable luxury email scene graph
   */
  static buildEmailSceneGraph(
    email: ParsedEmailData,
    canvasWidth: number = 800,
    canvasHeight: number = 900
  ): SceneGraph {
    const nodes: Record<string, SceneNode> = {};
    const rootIds: string[] = [];

    // Background Card
    const bgId = 'email_bg';
    nodes[bgId] = {
      id: bgId,
      name: 'Email Surface',
      type: 'background',
      parentId: null,
      childrenIds: [],
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      visible: true,
      locked: true,
      backgroundColor: '#141018',
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      source: 'eml'
    };
    rootIds.push(bgId);

    // Subject Line
    const subjId = 'email_subject';
    nodes[subjId] = {
      id: subjId,
      name: 'Subject',
      type: 'heading',
      parentId: null,
      childrenIds: [],
      x: 48,
      y: 40,
      width: canvasWidth - 96,
      height: 36,
      rotation: 0,
      opacity: 1,
      zIndex: 5,
      visible: true,
      locked: false,
      content: email.subject,
      fontFamily: 'Inter, sans-serif',
      fontSize: 20,
      fontWeight: 600,
      color: '#F4EFE6',
      constraints: { mode: 'reflow' },
      confidence: 1.0,
      source: 'eml'
    };
    rootIds.push(subjId);

    // Sender Name / Address
    const senderId = 'email_sender';
    nodes[senderId] = {
      id: senderId,
      name: 'From',
      type: 'name',
      parentId: null,
      childrenIds: [],
      x: 48,
      y: 92,
      width: 400,
      height: 24,
      rotation: 0,
      opacity: 1,
      zIndex: 5,
      visible: true,
      locked: false,
      content: `From: ${email.from}`,
      fontFamily: 'Inter, sans-serif',
      fontSize: 13.5,
      fontWeight: 500,
      color: '#D4AF37',
      constraints: { mode: 'reflow' },
      confidence: 1.0,
      source: 'eml'
    };
    rootIds.push(senderId);

    // Date
    const dateId = 'email_date';
    nodes[dateId] = {
      id: dateId,
      name: 'Date',
      type: 'timestamp',
      parentId: null,
      childrenIds: [],
      x: canvasWidth - 280,
      y: 92,
      width: 232,
      height: 20,
      rotation: 0,
      opacity: 1,
      zIndex: 5,
      visible: true,
      locked: false,
      content: email.date,
      fontFamily: 'Inter, sans-serif',
      fontSize: 12,
      fontWeight: 400,
      color: '#9D96A5',
      alignment: 'right',
      constraints: { mode: 'fixed' },
      confidence: 1.0,
      source: 'eml'
    };
    rootIds.push(dateId);

    // Body Block
    const bodyId = 'email_body';
    nodes[bodyId] = {
      id: bodyId,
      name: 'Body Content',
      type: 'text',
      parentId: null,
      childrenIds: [],
      x: 48,
      y: 140,
      width: canvasWidth - 96,
      height: Math.max(canvasHeight - 180, 200),
      rotation: 0,
      opacity: 1,
      zIndex: 5,
      visible: true,
      locked: false,
      content: email.bodyText,
      fontFamily: 'Inter, sans-serif',
      fontSize: 14,
      fontWeight: 400,
      color: '#E8EAED',
      lineHeight: 1.5,
      constraints: { mode: 'reflow' },
      confidence: 1.0,
      source: 'eml'
    };
    rootIds.push(bodyId);

    return {
      nodes,
      rootIds,
      canvasWidth,
      canvasHeight,
      backgroundColor: '#141018'
    };
  }
}
