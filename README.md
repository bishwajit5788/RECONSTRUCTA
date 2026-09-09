# RECONSTRUCTA — Luxury Universal Visual & Document Editor

> Production-quality, responsive, efficient, and luxurious web workstation for visual reconstruction, UI prototyping, document editing, and non-destructive mockup creation.

---

## 1. Product Overview

**RECONSTRUCTA** decomposes raster screenshots, native & scanned PDFs, RFC 822 EML emails, and DOCX documents into an editable, constraint-aware scene graph. It enables users to edit text, swap media, adjust typography, and reflow multi-component interfaces while preserving visual hierarchy, layout relationships, and underlying background textures.

### Key Capabilities
- **Multi-Format Ingestion**: PNG, JPG/JPEG, WebP, PDF (native & scanned), EML, DOCX, PPTX.
- **Vision & Semantic Classification Engine**: Automated visual segmentation into 25+ semantic component types (`text`, `name`, `timestamp`, `message`, `avatar`, `button`, `status-bar`, `navigation-bar`, `shape`, `table`, etc.).
- **Browser WebWorker OCR**: Non-blocking local optical character recognition via Tesseract.js with line/word bounding boxes and confidence scoring.
- **Typography & Iterative Fitter**: Heuristic font candidate ranking, weight/color sampling, and binary-search fitting to target bounds.
- **Constraint-Aware Layout Engine**: Auto-expanding parent containers (e.g. chat bubbles), anchored dependent elements (e.g. timestamps, read receipts), and vertical reflow of subsequent blocks.
- **Non-Destructive Inpainting**: Background reconstruction using client-side perimeter bilinear interpolation + Navier-Stokes synthesis, with optional FastAPI OpenCV (`cv2.inpaint`) backend acceleration.
- **Platform Adapters**: Dedicated UI recognition, typography hints, and component presets for WhatsApp, Telegram, iOS, Android, Instagram, Snapchat, and Email.
- **Local-First Privacy & Safety**: Defaults to 100% local in-browser processing with zero network leakage. Exported mockups feature a configurable `"EDITED / MOCKUP"` provenance indicator.

---

## 2. Luxury Design System

- **Obsidian**: `#08070A` (Deep canvas background)
- **Surface**: `#141018` & `#1C1520` (Dark luxury panels and elevated controls)
- **Antique Gold**: `#D4AF37` (Primary metallic accent)
- **Royal Burgundy**: `#6E1F2A` (Secondary accent)
- **Restrained Amethyst**: `#6D3FA8` (Ambient violet highlights)
- **Ivory Parchment**: `#F4EFE6` (High-contrast typography)
- **Multi-Color Conic Border Hover**: Dark obsidian button surfaces surrounded by an animated rotating conic gradient border (Gold, Violet, Burgundy, White highlight) with pointer-aware magnetic micro-movement (1–3px) and `@media (prefers-reduced-motion)` support.

---

## 3. Architecture

```
                                 ┌────────────────────────────────────────────────────────┐
                                 │                 RECONSTRUCTA FRONTEND                  │
                                 │        React 19 + TypeScript + Vite + Zustand          │
                                 └───────────────────────────┬────────────────────────────┘
                                                             │
                    ┌────────────────────────────────────────┼────────────────────────────────────────┐
                    │                                        │                                        │
     ┌──────────────▼──────────────┐          ┌──────────────▼──────────────┐          ┌──────────────▼──────────────┐
     │      Document & OCR         │          │     Canvas Engine Core      │          │     Luxury Design System    │
     │ • Tesseract.js (WebWorker)  │          │ • Custom Scene Graph Canvas │          │ • Obsidian / Gold / Burgundy│
     │ • PDF.js & pdf-lib          │          │ • 10%–800% Zoom / Pan / Grid│          │ • Conic Hover Glow Border   │
     │ • EML Parser & DOMPurify    │          │ • Rulers & Magnetic Snapping│          │ • Command Palette (Cmd+K)   │
     │ • DOCX / PPTX Parser        │          │ • 8-Handle Resize & Rotate  │          │ • Responsive Drawer Panels  │
     │ • Canvas Inpainting Engine  │          │ • Before/After Split Slider │          │ • IndexedDB Local Storage   │
     └──────────────┬──────────────┘          └──────────────┬──────────────┘          └──────────────┬──────────────┘
                                                             │ (Optional REST / Local Fallback)
                                              ┌──────────────▼──────────────┐
                                              │    FastAPI Python Backend   │
                                              │ • OpenCV Inpainting (TELEA) │
                                              │ • Advanced OCR & Document   │
                                              │ • Clean temporary files     │
                                              └─────────────────────────────┘
```

---

## 4. Getting Started

### Prerequisites
- Node.js >= 18.0.0 (v24 tested)
- Python >= 3.10 (Python 3.13 tested)

### Frontend Installation & Development
```bash
# Install NPM dependencies
npm install

# Run frontend development server
npm run dev
```
The application will launch at `http://127.0.0.1:5173/` (or next open port).

### Backend Setup (Optional OpenCV Acceleration)
```bash
# Create virtual environment and install dependencies
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Start backend server
.venv/bin/uvicorn app:app --port 8000
```
When running, the frontend status badge automatically updates from `LOCAL ONLY` to `BACKEND HYBRID`.

---

## 5. Testing & Verification

### Frontend Vitest Suite
```bash
npm run test
```
Runs 15 unit and integration tests covering:
- Scene graph node manipulation and layer ordering
- Typography estimation & iterative bounds fitting
- Constraint solver & chat bubble reflow
- Client-side canvas inpainting and quality scoring
- File format detector & magic byte security
- EML RFC 822 parser & DOMPurify script sanitization
- App component integration and export dialog triggering

### Production Build Verification
```bash
npm run build
```
Executes TypeScript type checking (`tsc -b`) and bundles production assets with Vite.

### Backend Pytest Suite
```bash
backend/.venv/bin/pytest backend/test_backend.py
```
Verifies OpenCV TELEA and Navier-Stokes inpainting, health check status, and input coordinate security.

---

## 6. Security & Safety Standards

- **Provenance Protection**: By default, exported mockups include a discrete `"EDITED / MOCKUP"` watermark to uphold authenticity boundaries.
- **Zero Script Execution**: Imported HTML emails and documents are aggressively sanitized via `DOMPurify` (stripping `<script>`, `onerror`, `onclick`, and external tracking objects).
- **File Limits**: Enforces a strict 50MB maximum upload limit, path traversal sanitization, and magic byte validation.
- **Local-First Default**: No user data is sent over the network unless the user opts into hybrid backend processing.
