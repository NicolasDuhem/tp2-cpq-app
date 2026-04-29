# Neon Compute Hotspot Analysis (Pass 1)

## 1) Executive summary

### Top 5 likely compute hotspots
1. `/sales/qpart-allocation` full-matrix load (`getSalesQPartAllocationPageData`) with unpaginated joins + in-memory reshape over `qpart_country_allocation` and metadata tables.
2. `/sales/bike-allocation` matrix load (`listSamplerRows`) pulling all matching rows from `CPQ_sampler_result` ordered descending without pagination.
3. `/cpq/results` matrix load (`listSamplerRows`) with `ILIKE '%...%'` search + no limit, then heavy client-side matrix pivot.
4. Repeated `DISTINCT ... ORDER BY` option loaders from `CPQ_sampler_result` (bike allocation, cpq results, dashboard-style pages), called on each page request.
5. `syncQPartCountryAllocationRows()` being invoked before qpart allocation reads/writes (adds write pressure to a large/high-read table).

### Top 5 quickest BIG wins (now)
1. Add server pagination to `/sales/qpart-allocation` and `/sales/bike-allocation` loaders.
2. Move qpart allocation filter/search primitives into SQL (not full in-memory post-processing).
3. Add debounce + submit-trigger mode for `/cpq/results` `sku_code` search if currently live-bound to keystrokes.
4. Cache low-churn filter option queries (rulesets/countries/bike types) with short TTL.
5. Stop running full allocation sync on every matrix request; run targeted sync or scheduled sync.

### Top 5 structural BIG wins (next)
1. Build read-model/materialized projection table for matrix pages (pre-pivoted rows).
2. Introduce async refresh pattern for heavy dashboards/matrices (cached snapshot + manual refresh).
3. Split “operational write” tables from “analytical read” tables for CPQ/QPart matrices.
4. Add workload-specific covering indexes proven by query paths in this repo.
5. Add query-level telemetry (duration/rows) around top matrix APIs to validate impact before/after.

### Overall risk rating
**High** (because large matrix pages are unpaginated and source tables show very high sequential tuple reads in live Neon stats).

---

## 2) Neon database inventory summary

Source used: `database-intelligence/Table_sizes.csv`, `table_read_write_stats.csv`, `Indexes.csv`, `Constraints.csv`, `columns_by_table_summary.csv`.

### Largest tables by total size
- `qpart_country_allocation` (~17 MB)
- `cpq_configuration_references` (~16 MB)
- `qpart_part_metadata_values` (~1.2 MB)
- `qpart_part_translations` (~728 KB)
- `qpart_parts` (~576 KB)

### Largest tables by estimated rows
- `qpart_country_allocation` (49,028)
- `qpart_part_metadata_values` (7,022)
- `qpart_part_translations` (5,266)
- `qpart_parts` (1,753)
- `cpq_image_management` (134)

### Highest sequential scan counts (`seq_scan`)
- `qpart_hierarchy_nodes` (54,712)
- `qpart_part_compatibility_rules` (9,830)
- `qpart_parts` (7,725)
- `cpq_setup_account_context` (2,749)
- `qpart_country_allocation` (2,076)

### Highest sequential tuples read (`seq_tup_read`)
- `qpart_country_allocation` (54,705,168)
- `qpart_hierarchy_nodes` (14,406,186)
- `qpart_parts` (3,910,451)
- `qpart_part_metadata_values` (635,048)

### Dead-row concerns
- `qpart_country_allocation` is flagged with dead-row warning in export (`estimated_dead_rows=1,947`; warning: `CHECK DEAD ROWS`).

### Tables with weak indexing relative to app usage
- `CPQ_setup_ruleset` is read heavily for `bike_type` and `cpq_ruleset` maps; only PK + unique ruleset index present.
- `qpart_hierarchy_nodes` has high sequential activity despite multiple indexes; query shape likely not selective (recursive parent-chain pattern).

### Tables with many indexes
- `cpq_sampler_result` has multiple useful indexes already (`ipn_country`, filter idx, ipn+created desc, unprocessed partial).
- `qpart_country_allocation` has PK + unique `(part_id,country_code)` + `active` + `country` indexes.

---

## 3) Page-to-endpoint map (high-impact pages)

| Page | Main component(s) | Endpoint(s) | Trigger | Dup-call risk | Caching | Load risk |
|---|---|---|---|---|---|---|
| `/sales/bike-allocation` | `components/sales/sales-bike-allocation-page.tsx`, `...table.client.tsx` | mutation APIs + server loader service | initial load + toggles + bulk + push + status checks | Medium (multiple row actions, refreshes) | low (dynamic/revalidate patterns) | **High** |
| `/sales/qpart-allocation` | `components/sales/sales-qpart-allocation-page.tsx`, `...table.client.tsx` | mutation APIs + server loader service | initial load + toggles + bulk + push + status checks | Medium/High | low | **Critical** |
| `/cpq/results` | `components/cpq/cpq-results-page.tsx`, `cpq-results-matrix.client.tsx` | server loader via `lib/cpq/results/service.ts` | initial load + filter/search changes | Medium | low | **High** |
| `/dashboard` | `components/dashboard/dashboard-page.tsx` | `lib/dashboard/service.ts` | initial load | Low | low/moderate | Medium |
| `/qpart/parts` | `components/qpart/qpart-parts-list-page.tsx` | `/api/qpart/parts`, `/api/qpart/hierarchy` | initial load + filter/search/import | Medium | low | Medium |
| `/cpq/setup` | `components/setup/cpq-setup-page.tsx` | multiple setup APIs + picture sync | initial load + CRUD actions | Medium | low | Medium |

Notes:
- BigCommerce status/lookup endpoints are user-driven cell actions; they can spike but are not continuous background pollers.
- No obvious cron scheduler file found in repo for Neon-facing periodic jobs.

---

## 4) Endpoint-to-Neon map (hot endpoints)

### `/sales/qpart-allocation` server load path
- Source: `lib/sales/qpart-allocation/service.ts`
- Reads: `qpart_parts`, `qpart_country_allocation`, `qpart_hierarchy_nodes` (self-joined chain), `qpart_part_metadata_values`, `qpart_metadata_definitions`, `cpq_country_mappings`.
- Query shape: wide SELECT, many LEFT JOINs, ORDER BY part_number/country, no LIMIT/OFFSET.
- Mutation: toggle and bulk update `qpart_country_allocation`.
- Risk: **Critical read + moderate write**.

### `/sales/bike-allocation` server load path
- Source: `lib/sales/bike-allocation/service.ts`
- Reads: `CPQ_sampler_result`, `CPQ_setup_ruleset`.
- Query shape: filtered SELECT with ORDER BY `id desc`, no pagination; filter options use DISTINCT scans.
- Mutation: toggle/bulk update `CPQ_sampler_result.active`.
- Risk: **High**.

### `/cpq/results` server load path
- Source: `lib/cpq/results/service.ts`
- Reads: `CPQ_sampler_result` + `CPQ_setup_ruleset` join; filter lists also read setup/account tables.
- Query shape: includes `ILIKE %sku%`, ORDER BY created/id desc, no LIMIT/OFFSET.
- Post-processing: heavy in-memory row grouping/pivot.
- Risk: **High**.

### `/api/bigcommerce/item-map/lookup`
- Source: `lib/bigcommerce/item-map.ts`
- Reads: `bc_item_variant_map` by SKU list via JSONB unpack + IN.
- Query shape: targeted lookup by indexed `sku_code`.
- Risk: Medium (burst-driven).

---

## 5) UI table/filter/dropdown analysis

- **Bike allocation matrix**: unpaginated matrix + per-cell actions; SQL filtering exists but full result set still loaded for matching ruleset/bike_type. **Risk: High**.
- **QPart allocation matrix**: very large country x part matrix expansion with metadata enrichment. **Risk: Critical**.
- **CPQ results matrix**: search + pivot over entire result set; potential expensive `ILIKE`. **Risk: High**.
- **Setup dropdowns (rulesets/countries/account context)**: safe cache candidates; currently re-read frequently. **Risk: Medium**.
- **BigCommerce status/check buttons**: on-demand network + DB upsert/read, high per-click cost but not always-on. **Risk: Medium**.

---

## 6) Query hotspot analysis

1. `lib/sales/qpart-allocation/service.ts:listPartAllocationRows`
- Expensive because it joins high-read tables, includes repeated hierarchy parent joins, and loads full matrix rows without pagination.
- Big-win fix: page by `part_id` (or `part_number`) + fetch country statuses separately, or precompute read model.
- Impact: **Very high**, effort medium/high.

2. `lib/sales/bike-allocation/service.ts:listSamplerRows`
- Expensive pattern: unbounded ordered read from `CPQ_sampler_result` on every page request.
- Big-win fix: cursor pagination + strict server filters + default narrowed time window.
- Impact: **High**, effort medium.

3. `lib/cpq/results/service.ts:listSamplerRows`
- Expensive pattern: `ILIKE '%term%'` + join + order + no limit.
- Big-win fix: debounce + minimum search length + optional trigram/index or prefix strategy.
- Impact: **High**, effort medium.

4. `lib/sales/qpart-allocation/service.ts:getSalesQPartAllocationPageData`
- Expensive because loads allocations + metadata + definitions + country mappings then aggregates in memory.
- Big-win fix: split endpoints (initial metadata vs paged matrix rows), cache static metadata.
- Impact: **High**, effort medium.

---

## 7) Index recommendations

See `docs/neon-compute-proposed-indexes.sql`.

Only proposed indexes tied to observed query patterns:
- `cpq_sampler_result(ruleset, ipn_code, country_code)` for allocation toggles/bulk and ruleset filtering.
- `cpq_sampler_result(ruleset, created_at desc, id desc)` for ordered ruleset scoped matrix reads.
- `qpart_country_allocation(part_id, country_code, active)` to improve row-country status reads/updates.
- optional `pg_trgm` GIN on `cpq_sampler_result.ipn_code` for `%sku%` search (review-first).

---

## 8) Pagination and server-side filtering recommendations

- `/sales/qpart-allocation`: default page size 100 parts; max 300. Keep country columns limited by active/selected region.
- `/sales/bike-allocation`: default page size 100 matrix rows; max 300; cursor by `(id desc)`.
- `/cpq/results`: default page size 100; max 250; server-side filters only; disallow empty broad search in high-load mode.

---

## 9) Caching recommendations

### Safe to cache
- Ruleset list, bike types, country mapping lists, metadata definitions (TTL 5–15 min).

### Cache with short TTL
- Dashboard aggregated summaries and CPQ results filter options (TTL 60–180 sec).

### Do not cache
- Allocation cell status writes/reads that must reflect immediate operator changes.

---

## 10) Implementation roadmap

### A) Quick wins / low risk / BIG impact
1. Add pagination to bike + qpart allocation loaders.
2. Cache setup/reference dropdown queries.
3. Debounce CPQ results search and require submit or min length.
4. Limit initial matrix render scope (e.g., default rule/country filter required).

### B) Medium changes / meaningful impact
1. Refactor qpart matrix fetch into paged API and lazy country/detail hydration.
2. Add proven index set from SQL file (non-concurrent in maintenance window, or concurrent where possible).
3. Add response payload size guardrails for matrix endpoints.

### C) Structural changes / highest long-term impact
1. Materialized read model for matrices.
2. Periodic/triggered pre-aggregation for dashboard + results.
3. Explicit Neon workload budget + telemetry alarms.

---

## 11) Exact proposed code-change plan (next pass)

For each proposed change, edit target files:
- `lib/sales/bike-allocation/service.ts`, `components/sales/sales-bike-allocation-page.tsx`, table client component.
- `lib/sales/qpart-allocation/service.ts`, `components/sales/sales-qpart-allocation-page.tsx`, table client component.
- `lib/cpq/results/service.ts`, `components/cpq/cpq-results-page.tsx`, `cpq-results-matrix.client.tsx`.
- Add SQL migration after approval using `docs/neon-compute-proposed-indexes.sql` as source.

Test/rollback plan:
- Capture baseline query timings, deploy paged/cached version behind flag, compare Neon compute minutes.
- Rollback by disabling pagination/caching flags and keeping old query path in parallel during rollout.

---

## 12) Small wins not worth doing now

1. Minor SQL style cleanups (alias naming/order only): low compute impact.
2. Micro-optimizing tiny admin lookup tables with <200 rows: negligible savings.
3. Refactoring docs-only API shape inconsistencies before load fixes: low runtime benefit.
4. Adding speculative indexes not tied to top matrix/search queries: write amplification risk > benefit.

---

## 13) Schema / code / documentation mismatches

1. **Export naming mismatch**: repo contains `Schema.csv`, `Constraints.csv`, `Indexes.csv`, `Table_sizes.csv` (capitalized), while request references lowercase filenames.
2. **Missing expected file**: `database-intelligence/README.md` is not present.
3. **Schema export format issue**: `Schema.csv` appears to contain one table’s columns only (no table_name column); full table/column truth instead available via `columns_by_table_summary.csv` + constraints/index exports.
4. Existing docs state database facts without explicitly referencing `database-intelligence/*` as primary live source; updated below.

