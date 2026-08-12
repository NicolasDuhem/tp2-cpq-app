-- Index proposals tied to current high-load query patterns.

-- 1) Bike allocation + CPQ results ruleset-scoped scans/order.
-- Benefits endpoint/page: /sales/bike-allocation and /cpq/results loaders (ruleset filters + ordering).
-- Why it helps: supports where ruleset = ? with stable created/id ordering.
-- Expected benefit: high for matrix pages under growing sampler volume.
-- Risk/cost: extra index maintenance on sampler writes; moderate.
-- Run now or review first: REVIEW FIRST (validate with EXPLAIN on production-like workload).
create index concurrently if not exists idx_cpq_sampler_result_ruleset_created_id
  on public.cpq_sampler_result (ruleset, created_at desc, id desc);

-- 2) Bike allocation toggle/bulk update row targeting.
-- Benefits endpoint/page: POST /api/sales/bike-allocation/toggle and /bulk-update.
-- Why it helps: aligns with ruleset + ipn_code + country_code lookup pattern.
-- Expected benefit: high for repeated operator updates.
-- Risk/cost: moderate write overhead; low correctness risk.
-- Run now or review first: RUN NOW (if write overhead acceptable).
create index concurrently if not exists idx_cpq_sampler_result_ruleset_ipn_country
  on public.cpq_sampler_result (ruleset, ipn_code, country_code);

-- 3) QPart allocation matrix and updates.
-- Benefits endpoint/page: /sales/qpart-allocation loader + toggle/bulk updates.
-- Why it helps: common pattern filters/joins by part_id + country_code, and reads active state.
-- Expected benefit: medium-high on largest table by live rows.
-- Risk/cost: moderate index bloat on frequently-updated table.
-- Run now or review first: REVIEW FIRST (table already has multiple indexes).
create index concurrently if not exists idx_qpart_country_allocation_part_country_active
  on public.qpart_country_allocation (part_id, country_code, active);

-- 4) Optional text search acceleration for cpq results SKU contains search.
-- Benefits endpoint/page: /cpq/results sku_code search (ILIKE '%term%').
-- Why it helps: trigram GIN supports contains search far better than btree.
-- Expected benefit: high when users perform frequent free-text SKU search.
-- Risk/cost: extension requirement + higher index size and write cost.
-- Run now or review first: REVIEW FIRST (requires pg_trgm policy approval).
create extension if not exists pg_trgm;
create index concurrently if not exists idx_cpq_sampler_result_ipn_trgm
  on public.cpq_sampler_result using gin (ipn_code gin_trgm_ops);
