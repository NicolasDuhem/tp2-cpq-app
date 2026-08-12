# Extraction report (historical context)

This file is retained as historical context about the original monolith-to-CPQ extraction.

## Current relevance boundaries
- Useful for understanding why the repo is CPQ-focused and why unrelated domains are absent.
- Not authoritative for current runtime/database behavior.

## For current truth, use instead
1. code in `app/`, `components/`, `lib/`, `types/`
2. live Neon schema CSV exports at repo root
3. reconciled docs in:
   - `ARCHITECTURE.md`
   - `PROCESSDATA.md`
   - `DATABASE.md`
   - `CPQ_MANUAL_LIFECYCLE.md`

## Historical summary
- Retained CPQ routes/pages/setup/results and associated services.
- Removed auth/admin/legacy domains from extraction source.
- Kept `sql/schema.sql` and `sql/seed.sql` as baseline setup artifacts.

## Caution
Because live schema evolved, do not assume baseline SQL fully matches production/live Neon schema without checking CSV exports.
