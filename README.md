# tp2-cpq-app

CPQ-only Next.js application prepared for migration from `AppBikeConfig` into a clean standalone repository.

## Retained functional scope
- CPQ Bike Builder runtime
- CPQ sampler process and result persistence
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
