# EXTRACTION_REPORT

## Extraction plan executed
1. Identify CPQ-only dependency graph from retained pages (`/cpq`, `/cpq/setup`, `/cpq/results`) and APIs they call.
2. Keep only CPQ runtime, sampler persistence, setup APIs, and required shared layout/db libs.
3. Remove all unrelated pages/APIs/components/libs/tests/docs/middleware/auth stack.
4. Rebuild minimal SQL baseline (`sql/schema.sql`, `sql/seed.sql`) for retained tables only.
5. Replace documentation with CPQ-only operational docs.

## Exactly what was kept
- UI pages:
  - `/cpq`, `/bike-builder`, `/cpq/setup`, `/cpq/results`
- APIs:
  - `/api/cpq/init`
  - `/api/cpq/configure`
  - `/api/cpq/image-layers`
  - `/api/cpq/sampler-result`
  - `/api/cpq/setup/account-context` (+ `/:id`)
  - `/api/cpq/setup/rulesets` (+ `/:id`)
  - `/api/cpq/setup/picture-management` (+ `/:id`, `/sync`)
- Shared code:
  - CPQ client/config/mappers/types/mock-data
  - CPQ setup services
  - CPQ results service
  - sampler persistence service
  - DB connector
  - shell layout + reduced nav
- SQL:
  - `sql/schema.sql`, `sql/seed.sql`

## Exactly what was removed
- Unrelated pages/domains:
  - sales matrix, SKU definition/setup, cpq-feature product flow, admin pages, users, feature flags, login.
- Unrelated APIs:
  - auth, me/roles/permissions/users, feature flags, product setup, cpq matrix, cpq generate/options/push/smoke.
- Unrelated libraries:
  - auth/rbac/admin tooling/legacy matrix & SKU services/bigcommerce/feature flags.
- Unrelated tests and historical docs/scripts.
- Middleware login enforcement and next-auth typing route support.
- Legacy SQL migration inventory files not needed for fresh CPQ baseline.

## Required env vars (retained scope)
- `DATABASE_URL`
- `CPQ_API_KEY` (unless `CPQ_USE_MOCK=true`)
- `CPQ_BASE_URL`
- `CPQ_TIMEOUT_MS`
- `CPQ_INSTANCE`
- `CPQ_PROFILE`
- `CPQ_NAMESPACE`
- `CPQ_PART_NAME`
- `CPQ_ACCOUNT_TYPE`
- `CPQ_CURRENCY`
- `CPQ_COMPANY`
- `CPQ_CUSTOMER_LOCATION`
- `CPQ_HEADER_ID`
- `CPQ_DETAIL_ID`
- Optional: `CPQ_USE_MOCK`

## Migration strategy recommendation
Use a **fresh baseline** migration strategy for `tp2-cpq-app`:
- Baseline from `sql/schema.sql` as migration `0001_baseline_cpq.sql`.
- Seed from `sql/seed.sql`.
- Do **not** carry over historical migrations from the source monolith (all previous numbered SQL files), because they include removed domains and legacy transitions now irrelevant to the retained schema.

## Unresolved dependencies / assumptions
- Authentication/authorization was removed for minimal extraction scope; add perimeter security at infrastructure/API gateway level if needed.
- CPQ API contract remains dependent on external CPQ service availability and credentials.
- Existing production data migrations from old monolith are not auto-translated; if data backfill is required, create one-time ETL scripts separately.

## Manual follow-up before pushing to new repo
1. Create new repository `tp2-cpq-app` and push this extracted tree.
2. Configure CI for `npm run build` and schema checks.
3. Provision PostgreSQL database and apply `sql/schema.sql` + `sql/seed.sql`.
4. Set runtime env vars in deployment target.
5. Optionally add auth layer (reverse proxy or app-level) based on target security model.

## Second-pass structural cleanup

### Goal
Reorganize the already-retained CPQ-only scope into a clean migration-ready structure for the future `tp2-cpq-app` repository, without changing business behavior.

### Structural actions completed
- Moved runtime CPQ integration code into `lib/cpq/runtime`.
- Moved setup data/service logic into `lib/cpq/setup/service.ts`.
- Moved results read model into `lib/cpq/results/service.ts`.
- Moved DB connector into `lib/db/client.ts`.
- Introduced centralized type files:
  - `types/cpq.ts`
  - `types/setup.ts`
- Converted route files under `app/` to thin wrappers where possible, moving heavier UI pages into:
  - `components/cpq/*`
  - `components/setup/*`
  - `components/shared/*`

### Route cleanup decision
- `/cpq` is now the canonical Bike Builder route.
- `/bike-builder` is retained strictly as a compatibility alias and now redirects to `/cpq`.

### Documentation cleanup
- Consolidated retained documentation under `docs/`.
- Added `docs/REPO_STRUCTURE.md` to describe final folder responsibilities and migration boundaries.

### Migration-readiness outcome
The repository now reads as a standalone CPQ app (runtime, setup, results, DB, types, SQL, docs) with reduced monolith-era naming ambiguity and clearer code ownership by domain.
