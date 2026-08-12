# Neon Compute Hotspot Analysis (Pass 1 + safe implementation status)

## Implemented in this pass (safe/high-value)

- `/sales/bike-allocation`
  - Added server-side pagination with defaults `page_size=100` and max `300`.
  - Kept existing server-side ruleset/bike-type filtering.
  - Added lightweight filter-options cache (5-minute TTL) to reduce repeated DISTINCT query load.
- `/cpq/results`
  - Added server-side pagination with defaults `page_size=100` and max `250`.
  - Added minimum search-length gating for `sku_code` (3+ chars) before issuing SQL `ILIKE` search.
  - Added client debounce (~350ms) before updating URL/search query.
  - Added lightweight filter-options cache (5-minute TTL).
- `SELECT *`/payload trim
  - Verified these hotspot services already use explicit column projections; no broad `SELECT *` remained in the edited hotspot paths.

## Deferred intentionally for safety

- `/sales/qpart-allocation` server pagination/filter migration was deferred in this pass because matrix/business filtering and bulk behavior are tightly coupled to the full in-memory row model; a safe split-by-part paging approach needs a dedicated follow-up with compatibility tests.
- `syncQPartCountryAllocationRows()` behavior change was deferred for the same safety reason (requires formal “missing-row ensure” contract tests before changing invocation frequency).
- Proposed indexes marked `REVIEW FIRST` in `docs/neon-compute-proposed-indexes.sql` were not applied yet in this pass.

## Schema intelligence reconciliation status

- Reviewed live exports under `database-intelligence/`.
- No safe full `sql/schema.sql` resync was applied in this pass because the repo schema baseline and migration chain are currently being used as app-owned DDL source; a direct overwrite from export snapshots needs dedicated migration provenance checks.
- Follow-up recommended: separate schema-refresh pass that compares `sql/schema.sql` against live export with a migration-by-migration reconciliation log.


## Pagination updates (2026-04-29)
- Sales Bike Allocation uses server page size 100 and now renders page-number pagination below the table.
- Sales QPart Allocation now uses server-side pagination on part rows with default page size 200 and below-table page-number pagination.
- QPart Parts list now uses server-side pagination with default page size 200 and below-table pagination controls.
