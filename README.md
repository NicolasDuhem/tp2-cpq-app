# tp2-cpq-app

CPQ-only Next.js application prepared for migration from `AppBikeConfig` into a clean standalone repository.

## Retained functional scope
- CPQ Bike Builder runtime
- Single CPQ configuration traversal workflow (dynamic `/configure`-driven sampling) and result persistence
- CPQ setup area:
  - Account code management
  - Ruleset management
  - Picture management

## Routes
- `/cpq` (primary Bike Builder route)
- `/bike-builder` (legacy alias route redirected to `/cpq`)
- `/cpq/setup`
- `/cpq/results`

## APIs
- `POST /api/cpq/init`
- `POST /api/cpq/configure`
- `POST /api/cpq/image-layers`
- `POST /api/cpq/sampler-result`
- Setup APIs under `/api/cpq/setup/*` for account context, rulesets, and picture management

## Quick start
```bash
npm install
cp .env.example .env.local
psql "$DATABASE_URL" -f sql/schema.sql
psql "$DATABASE_URL" -f sql/seed.sql
npm run dev
```

## Documentation
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/REPO_STRUCTURE.md`
- `docs/DATABASE.md`
- `docs/PROCESSDATA.md`
- `docs/EXTRACTION_REPORT.md`

## Traversal behavior (Bike Builder page)
- The `/cpq` page now has **one** traversal action: **Start configuration traversal**.
- Traversal starts from an initialized CPQ configuration (`/api/cpq/init`) and explores reachable states by applying **one option change at a time** via `/api/cpq/configure`.
- The traversal is dependency-aware (dynamic CPQ tree/graph), not a static cartesian product.
- Progress area shows:
  - estimated total (heuristic, adaptive)
  - processed transitions
  - saved rows
  - duplicate `(ipn_code, country_code)` skipped
  - run status (`idle/running/paused/stopped/completed/failed`)
- `country_code` is derived from the selected account context (`CPQ_setup_account_context`) shown in the page summary.
