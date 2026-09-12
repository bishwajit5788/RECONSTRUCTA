# RECONSTRUCTA Production Hardening — September 2026

## Changes in this branch

- R2 object IDs are now restart-safe: object keys are derived from the object ID instead of depending on an in-memory lookup table.
- R2 metadata can be rediscovered with `head_object` after a backend restart.
- R2 expiration metadata is synchronized when project retention is extended.
- Production CORS rejects wildcard configuration and requires explicit `CORS_ORIGINS`.
- Optional bearer authentication has been added behind `RECONSTRUCTA_AUTH_REQUIRED=true`.
- Authentication fails closed when `RECONSTRUCTA_AUTH_SECRET` is missing or a token is invalid/expired.
- Request body size is capped at 60 MB at middleware level.
- Security response headers are added (`nosniff`, frame denial, no-referrer).
- Signed-session authentication unit tests were added.

## Important remaining work

This branch does **not** claim full production readiness. A real OIDC/identity provider, distributed rate limiting, streaming uploads, durable authorization/ownership checks, browser E2E tests, load testing, and benchmark-backed reconstruction metrics remain required before public deployment.
