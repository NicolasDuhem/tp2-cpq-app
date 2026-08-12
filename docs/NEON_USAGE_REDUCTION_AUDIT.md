# Neon usage reduction audit (2026-05-28)

## Hotspot findings (from live-neon exports)
- `bc_item_variant_map` dominates read waste (`seq_scan` and `seq_tup_read` very high versus ~1.8k live rows).
- `qpart_country_allocation` and `qpart_hierarchy_nodes` show heavy repeated reads for small/medium table sizes.
- `cpq_configuration_references` has small row count but large table size, with `json_snapshot` known to be very large and high network-transfer risk if over-selected.

## `json_snapshot` read/write path inventory

### Reads
1. `lib/cpq/runtime/configuration-references.ts` / `resolveConfigurationReferenceFull()` reads full row (`select *`) for explicit detail endpoint use.
2. `lib/cpq/runtime/configuration-references.ts` / `resolveConfigurationReferenceLite()` now reads a lightweight projection and intentionally excludes `json_snapshot` + `finalize_response_json`.
3. `app/api/cpq/configuration-references/route.ts` GET now uses full resolver for explicit by-reference detail retrieval.
4. `app/api/cpq/retrieve-configuration/route.ts` now uses lite resolver; retrieve/start-session flow does not read `json_snapshot`.

### Writes
1. `app/api/cpq/configuration-references/route.ts` POST forwards `json_snapshot` to runtime save helper.
2. `lib/cpq/runtime/configuration-references.ts` / `saveConfigurationReference()` writes `json_snapshot` in upsert insert/update.
3. `components/cpq/bike-builder-page.tsx` sends `json_snapshot` payload during manual and bulk save calls.

## Full JSON dependency conclusion
- Current retrieve/reload flow does not require full `json_snapshot`; it rebuilds CPQ state from canonical identity/context fields + new StartConfiguration response.
- Full `json_snapshot` is still available via explicit detail GET route, but no inspected business-critical reload path depends on full snapshot content.

## Snapshot reduction decision
- Implemented write-time reducer for newly saved rows only.
- Historical rows are left untouched.
- Reduced set includes only captions: `ForecastAs`, `Description`, `DetailId`, `TradePrice`, `MSRP`.
- Entries are dropped when value is `null`, `undefined`, empty/blank string, number `0`, or string `'0'`.

## Query optimization changes implemented
- Removed heavy `json_snapshot` selection from retrieve path by introducing lite configuration-reference resolver.
- Kept full-row selection only for explicit detail endpoint.

## Follow-up recommendations
- Backfill historical `cpq_configuration_references` rows in a controlled migration/batch script after runtime verification in staging.
- Next optimization pass should target `bc_item_variant_map` join normalization in bike/qpart/dashboard services (replace trim/coalesce predicates with normalized key columns or pre-normalized lookups).

## Snapshot reduction refinement: ForecastAs and price maxima (2026-06-03)
- Newly reduced `cpq_configuration_references.json_snapshot` rows still retain only `ForecastAs`, `Description`, `DetailId`, `TradePrice`, and `MSRP` captioned entries.
- `ForecastAs` entries are retained only when the value is meaningful and at least 13 characters long. Short option fragments such as `_ULT`, `_BLA`, and `_STD` are treated as selectable-option noise and removed.
- Primary `ForecastAs` extraction prefers full values in the 15-to-30-character range and scores `raw.Details` / `Details` paths ahead of `screenOptions`, `SelectableValues`, and `CustomProperties` paths.
- `MSRP` keeps only the first deterministic entry with the maximum safely parsed non-zero numeric value.
- `TradePrice` keeps only the first deterministic entry with the maximum safely parsed non-zero numeric value.
- `null`, `undefined`, blank strings, numeric `0`, and string `0` continue to be dropped.
- Historical rows are not bulk rewritten by this runtime change; they will only change if saved again or migrated by a separate controlled backfill.

### Reduced snapshot validation SQL
Preferred JSON path inspection for new reduced snapshots:

```sql
select
  id,
  configuration_reference,
  jsonb_path_query_array(json_snapshot, '$.** ? (@.caption == "ForecastAs")') as forecast_as_entries,
  jsonb_path_query_array(json_snapshot, '$.** ? (@.caption == "MSRP")') as msrp_entries,
  jsonb_path_query_array(json_snapshot, '$.** ? (@.caption == "TradePrice")') as trade_price_entries,
  created_at
from cpq_configuration_references
order by created_at desc
limit 20;
```

Fallback query if JSON path syntax is unavailable in the SQL client:

```sql
select
  id,
  configuration_reference,
  json_snapshot,
  created_at
from cpq_configuration_references
order by created_at desc
limit 5;
```
