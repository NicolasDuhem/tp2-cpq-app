# Repository structure and ownership

## Top-level areas
- `app/` — Next.js route entries (pages + API handlers).
- `components/` — UI modules (`cpq`, `setup`, `sales`, `docs`, `shared`).
- `lib/` — business/data services (`cpq/runtime`, `cpq/setup`, `cpq/results`, `sales/bike-allocation`, `db`).
- `types/` — shared TypeScript contracts.
- `sql/` — baseline schema + migrations + seed.
- `docs/` — implementation documentation.

## Route ownership
### Pages
- `app/cpq/page.tsx` → `components/cpq/bike-builder-page.tsx`
- `app/cpq/setup/page.tsx` → `components/setup/cpq-setup-page.tsx`
- `app/cpq/results/page.tsx` → `components/cpq/cpq-results-page.tsx`
- `app/cpq/process/page.tsx` → `components/docs/process-page.tsx`
- `app/cpq/ui-docs/page.tsx` → `components/docs/ui-docs-page.tsx`
- `app/sales/bike-allocation/page.tsx` → `components/sales/sales-bike-allocation-page.tsx`

### Redirects
- `app/page.tsx` redirects `/` to `/cpq`.
- `app/bike-builder/page.tsx` redirects `/bike-builder` to `/cpq`.

## API ownership
- `app/api/cpq/*` — CPQ lifecycle + persistence + setup + picture routes.
- `app/api/sales/bike-allocation/*` — allocation toggle/bulk/launch-context APIs.

## Service ownership
- `lib/cpq/runtime/*`
  - CPQ API client calls
  - mapping/normalization
  - canonical reference persistence
  - sampler persistence
  - trace logging
- `lib/cpq/setup/service.ts`
  - setup CRUD
  - picture-management update/sync/layer resolution
- `lib/cpq/results/service.ts`
  - sampler results matrix read model
- `lib/sales/bike-allocation/service.ts`
  - sales matrix model, status writes, launch replay context resolution
- `lib/db/client.ts`
  - Neon client wrapper

## Maintenance rule
When runtime behavior changes, update:
1. API and/or service code
2. affected page/component docs
3. `docs/PAGES_AND_COMPONENTS.md`
4. `docs/DOC_GAP_ANALYSIS.md` (if correcting stale docs)
