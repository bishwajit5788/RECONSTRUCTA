/**
 * RECONSTRUCTA — PARSERS & SECURITY TEST SUITE
 */

import { describe, it, expect } from 'vitest';
import { FileDetector } from '../parsers/fileDetector';
import { EMLParser } from '../parsers/emlParser';

describe('File Security & Format Detector', () => {
  it('blocks oversized files exceeding the 50MB safety limit', async () => {
    const fakeFile = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(fakeFile, 'size', { value: 55 * 1024 * 1024 });

    const result = await FileDetector.validateFile(fakeFile);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds the 50MB security limit');
  });

  it('sanitizes unsafe filename paths against directory traversal', () => {
    const maliciousName = '../../etc/passwd..png';
    const sanitized = FileDetector.sanitizeFilename(maliciousName);
    expect(sanitized).not.toContain('/');
    expect(sanitized).not.toContain('\\');
  });
});

describe('EML Parser & HTML Sanitization', () => {
  it('parses standard RFC 822 headers and strips malicious JavaScript scripts', () => {
    const rawEml = `From: "Alice Smith" <alice@example.com>
To: "Bob Jones" <bob@example.com>
Subject: Project Kickoff Meeting
Date: Mon, 12 Oct 2026 10:00:00 +0000

<p>Hello Bob,</p>
<script>alert("XSS Attack!");</script>
<img src="valid.png" onerror="stealCookies()" />
<p>Looking forward to our sync.</p>`;

    const parsed = EMLParser.parseRawEML(rawEml);

    expect(parsed.from).toContain('Alice Smith');
    expect(parsed.to).toContain('bob@example.com');
    expect(parsed.subject).toBe('Project Kickoff Meeting');

    // Security Verification: Ensure <script> and onerror are completely stripped
    expect(parsed.sanitizedHtml).not.toContain('<script>');
    expect(parsed.sanitizedHtml).not.toContain('alert');
    expect(parsed.sanitizedHtml).not.toContain('stealCookies');
    expect(parsed.sanitizedHtml).toContain('Hello Bob');
  });
});
