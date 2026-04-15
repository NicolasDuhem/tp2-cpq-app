# Repository structure and ownership

## Top-level areas

- `app/` — Next.js route entries and API route handlers.
- `components/` — UI implementations split by domain (`cpq`, `setup`, `docs`, `shared`).
- `lib/` — runtime/service logic (`cpq/runtime`, `cpq/setup`, `cpq/results`, `db`).
- `types/` — shared TypeScript domain types.
- `docs/` — system documentation.
- `sql/` — baseline SQL schema/seed (must be reconciled with live CSV exports).
- root CSV schema exports:
  - `table.csv`
  - `columns.csv`
  - `fieldrequired.csv`
  - `constraints.csv`
  - `indexes.csv`

## Route ownership

### Pages
- `app/cpq/page.tsx` → Bike Builder page (`components/cpq/bike-builder-page.tsx`).
- `app/cpq/setup/page.tsx` → setup page (`components/setup/cpq-setup-page.tsx`).
- `app/cpq/results/page.tsx` → sampler results matrix (`components/cpq/cpq-results-page.tsx`).
- `app/cpq/ui-docs/page.tsx` → UI label/data mapping page (`components/docs/ui-docs-page.tsx`).

### Redirects
- `app/page.tsx` redirects `/` to `/cpq`.
- `app/bike-builder/page.tsx` redirects `/bike-builder` to `/cpq`.

## API ownership
- `app/api/cpq/*` runtime + persistence routes.
- `app/api/cpq/setup/*` setup and picture-management admin routes.

## Service ownership
- `lib/cpq/runtime/*` — CPQ calls, normalization, canonical reference persistence, sampler persistence, debug tracing.
- `lib/cpq/setup/service.ts` — setup CRUD, sync, image layer resolution.
- `lib/cpq/results/service.ts` — matrix read-model and filtering source queries.
- `lib/db/client.ts` — Neon SQL adapter.

## Maintenance note
When changing runtime behavior, update both:
1. corresponding docs in `docs/`, and
2. if labels/sections changed, the `/cpq/ui-docs` source (`components/docs/ui-docs-page.tsx`).
