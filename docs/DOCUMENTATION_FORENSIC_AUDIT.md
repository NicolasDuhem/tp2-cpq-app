# Documentation Forensic Audit

This document records additive documentation audit findings. Do not treat it as a replacement for the source-of-truth runtime files.

## Environment variable audit

- Audit date: 2026-06-02.
- Source of truth used: static code search across `app/`, `components/`, `lib/`, `scripts/`, `sql/`, `next.config.*`, `package.json`, plus existing docs/README review.
- App/code environment variables found: 47 app-managed variables, plus platform-provided `NODE_ENV` referenced by runtime code.
- Vercel screenshot variables provided by user: 27.
- Canonical environment documentation before this audit: `docs/ENVIRONMENT_VARIABLES.md` did not exist, so all app-managed variables were missing from a single canonical env map before this audit.
- Variables visible in the screenshot but not found in static code search: 1 (`FLAGS`).
- Variables used in code but not visible in the provided screenshot: 21 app-managed variables plus platform-provided `NODE_ENV`.
- Files added/updated by this audit:
  - `.env.example`
  - `docs/ENVIRONMENT_VARIABLES.md`
  - `README.md`
  - `docs/DOCUMENTATION_FORENSIC_AUDIT.md`

### Variables visible in screenshot but not found in code

| Variable | Status | Recommendation |
|---|---|---|
| `FLAGS` | Vercel screenshot variable — not found in static code search. | Do not delete automatically. Confirm whether it is legacy, Vercel-integration-managed, indirectly consumed, or safe to remove. |

### Variables used in code but not visible in screenshot

The screenshot may be incomplete. These variables were not visible in the provided screenshot but are referenced by code or code-driven configuration helpers:

- `CPQ_BASE_URL`
- `CPQ_TIMEOUT_MS`
- `CPQ_PROFILE`
- `CPQ_NAMESPACE`
- `CPQ_PART_NAME`
- `CPQ_ACCOUNT_TYPE`
- `CPQ_CURRENCY`
- `CPQ_COMPANY`
- `CPQ_CUSTOMER_LOCATION`
- `CPQ_HEADER_ID`
- `CPQ_USE_MOCK`
- `CPQ_DEBUG`
- `CPQ_COPY_CONFIGURATION_URL`
- `CPQ_COPY_REQUEST_WRAPPER`
- `CPQ_COPY_TIMEOUT_MS`
- `NEXT_PUBLIC_CPQ_INSTANCE`
- `EXTERNAL_PG_SSL_REJECT_UNAUTHORIZED`
- `EXTERNAL_PG_CONNECT_TIMEOUT_MS`
- `EXTERNAL_PG_QUERY_TIMEOUT_MS`
- `EXTERNAL_PG_STATEMENT_TIMEOUT_MS`
- `EXTERNAL_VARIANT_TABLE_WRITE_CONCURRENCY`
- `NODE_ENV` (platform-provided; normally not manually managed in Vercel)

### High-risk notes

- `NEXT_PUBLIC_*` variables are browser-visible and must never contain secrets. This audit found `NEXT_PUBLIC_CPQ_DEBUG` and `NEXT_PUBLIC_CPQ_INSTANCE`.
- Expected-value variables must be manually checked in Vercel. Examples include boolean string toggles (`BIGCOMMERCE_BC_STATUS_ENABLED`, `CPQ_USE_MOCK`, `CPQ_DEBUG`, `NEXT_PUBLIC_CPQ_DEBUG`, `EXTERNAL_PG_SSL`, `EXTERNAL_PG_SSL_REJECT_UNAUTHORIZED`), numeric settings (`BIGCOMMERCE_API_TIMEOUT_MS`, `BIGCOMMERCE_VARIANT_CHECK_BATCH_SIZE`, `CPQ_TIMEOUT_MS`, external PG timeouts), and literal/default-sensitive CPQ identifiers (`CPQ_HEADER_ID`, `CPQ_PART_NAME`, `CPQ_INSTANCE`, `CPQ_DETAIL_ID`).
- Secrets must be marked Sensitive in Vercel. High-priority sensitive variables include `DATABASE_URL`, `APP_BOOTSTRAP_ADMIN_PASSWORD`, `CPQ_API_KEY`, `CPQ_COPY_API_KEY`, `BIGCOMMERCE_ACCESS_TOKEN`, `BIGCOMMERCE_STORE_HASH`, `EXTERNAL_PG_PASSWORD`, `BLOB_READ_WRITE_TOKEN`, `QPART_UPDATE_ALL_PASSWORD`, and `OPENAI_API_KEY`.
- `QPART_UPDATE_ALL_PASSWORD` is still used and has an unsafe legacy fallback in code if unset. Production/preview should explicitly set a strong value.
- No single server-only env validation module exists. Validation is distributed across service-specific helpers and route code. A future dedicated validator would reduce configuration drift.

See `docs/ENVIRONMENT_VARIABLES.md` for the full canonical inventory, screenshot comparison, and Expected Vercel values checklist.

## API route and message-flow map follow-up — 2026-06-04

Added `docs/API_ROUTE_AND_MESSAGE_FLOW_MAP.md` as a static-code-inspection map of all `app/api/**/route.ts` handlers, frontend/internal API caller flows, data lineage, visible permission enforcement, external systems, Mermaid diagrams, and high-risk API routes. This was documentation-only; no runtime code, API behavior, database schema, or existing documentation was destructively changed.
