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

## Bike Builder operating modes (`/cpq`)
- Mode selector at top of page:
  - **CPQ for a market** (existing single-market behavior)
  - **CPQ for a bike across market** (run one selected bike across multiple markets)

### CPQ for a market
- Preserves existing behavior:
  - account code selector
  - configurator option changes via `/api/cpq/configure`
  - traversal actions and auto-save
  - manual **Save Configuration**

### CPQ for a bike across market
- Keeps same main layout (**Configurator / Bike preview / Summary**).
- Adds market checkbox list sourced from active `CPQ_setup_account_context` rows (unique `country_code` values).
- Runs the current selected bike configuration across selected markets:
  1. initialize market context from account context row (`account_code`, `customer_id`, `currency`, `language`, `country_code`)
  2. replay selected configurator choices
  3. persist to `CPQ_sampler_result` using existing save endpoint
  4. wait 5000ms between markets
- Progress shows selected/processed/saved/duplicate counts, current country, and last message.

## Traversal behavior (Bike Builder page)
- In **CPQ for a market** mode, the `/cpq` page has one traversal action: **Start configuration traversal**.
- Traversal candidates are sourced from the same **visible Configurator dropdown model** used by the UI (`state.features`), not from raw CPQ payload feature arrays.
- Traversal starts from an initialized CPQ configuration (`/api/cpq/init`) and explores reachable states by applying **one visible dropdown option change at a time** via `/api/cpq/configure`.
- The traversal is dependency-aware (dynamic CPQ tree/graph), not a static cartesian product.
- During traversal, the last changed dropdown field is transiently highlighted in the Configurator panel.
- Progress area shows:
  - estimated total (heuristic, lower-bound adaptive; based on visible dropdown choices only)
  - processed transitions
  - saved rows
  - duplicate `(ipn_code, country_code)` skipped
  - configure call count
  - last save status/message
  - run status (`idle/running/paused/stopped/completed/failed`)
- Manual **Save Configuration** and traversal auto-save share the same persistence path (`POST /api/cpq/sampler-result`) and dedupe behavior.
- `country_code` is derived from the selected account context (`CPQ_setup_account_context`) shown in the page summary.
- `detailId` is unique per CPQ configuration state. The app refreshes it from every parsed CPQ response (init/configure) and always uses the latest live value for UI badges and all save paths (manual, traversal, across-market).
