# RECONSTRUCTA — Production Hardening Remaining Work

> This document records the remaining engineering work after the September 2026 reconstruction-engine upgrade. It intentionally does not claim 100% fidelity.

## Resolved in the current repository

- Universal Scene Graph traceability and reconstruction-status metadata.
- Evidence-based visual detection and human review workflow.
- Tesseract OCR integration and review metadata.
- Iterative typography fitting with explicit approximation limits.
- OpenCV inpainting with measured boundary/color/variance quality signals.
- PDF multi-page parsing and page manipulation.
- DOCX/PPTX/EML extraction with explicit partial/flattened capability declarations.
- Magic-byte validation and ZIP decompression-bomb checks.
- 2-hour retention metadata and cleanup worker.
- Request IDs and payload-safe request logging.
- CI baseline for frontend/backend tests and production build.

## Remaining blockers before internet-facing production

### P0 — must resolve

1. **Durable R2 object index**
   - MongoDB must be authoritative for `object_id -> r2_key` resolution.
   - R2 access must continue to work after a backend restart.
   - Process memory must not be required for object discovery, download, delete, or expiry.

2. **Authentication and authorization**
   - Establish a real authenticated principal.
   - Enforce project ownership for project, asset, version, processing, and export operations.
   - Never treat a client-supplied `owner_session` as an authenticated identity.

3. **Production fail-closed configuration**
   - Production must reject startup/readiness when MongoDB or R2 is unavailable.
   - Local in-memory storage/database fallback must remain development/test-only.

4. **Resource exhaustion controls**
   - Enforce decoded image pixel limits, document page limits, ZIP entry limits, MIME part limits, and processing timeouts.
   - Prefer streaming uploads instead of reading the full multipart body into RAM.

### P1 — reliability and scale

5. Replace the in-process IP rate limiter with a distributed limiter for multi-instance deployments.
6. Add durable background jobs/workers for OCR, vision, inpainting, and large document processing.
7. Add structured metrics/tracing for request/job latency, failures, memory pressure, provider/model versions, and queue depth without logging document contents.
8. Add Playwright end-to-end tests covering import → analyze → review → edit → export → re-import.
9. Add restart/recovery tests that verify R2 objects and Mongo metadata survive backend restarts.
10. Add adversarial corpus tests for malformed images, PDFs, OpenXML archives, MIME messages, ZIP bombs, polyglots, and oversized dimensions.

### P1 — reconstruction fidelity

11. Add pluggable ML vision providers for semantic/instance detection and segmentation while retaining the deterministic detector as fallback.
12. Add perceptual inpainting evaluation in addition to boundary heuristics.
13. Expand typography ranking with rendered candidate comparison and benchmark datasets.
14. Improve native PDF/DOCX/PPTX fidelity where the source format permits native reconstruction.
15. Keep unsupported/flattened features visibly classified rather than silently presenting them as editable.

### P2 — evidence and operations

16. Replace broad confidence numbers with benchmark-backed precision/recall/error metrics, dataset/version, model/provider version, and test counts.
17. Add a machine-readable reconstruction capability report to each import.
18. Add load/performance benchmarks and explicit budgets for memory, latency, and concurrency.
19. Perform a real deployed restart/failure drill before enabling public deployment.

## Deployment gate

Do not deploy to Vercel or expose the backend publicly until P0 items pass automated tests and the restart, authorization, adversarial-file, and E2E suites pass in a production-like environment.
