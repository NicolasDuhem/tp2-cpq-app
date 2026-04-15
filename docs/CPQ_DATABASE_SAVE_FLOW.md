# CPQ database save flow

## Canonical persistence path

Manual save on `/cpq` persists into `cpq_configuration_references`.

Flow:
1. finalize active session,
2. extract finalized detail ID,
3. build canonical save payload from latest configure snapshot (fallback latest start snapshot),
4. upsert canonical row by `configuration_reference`,
5. auto-write one support sampler row.

## Canonical save payload composition

### From finalize step
- `canonical_detail_id` / `finalized_detail_id` derived from finalize-parsed detail fallback chain.
- `finalize_response_json` stores finalize raw response payload.

### From snapshot source (configure preferred)
- parsed normalized state and selected option snapshot into `json_snapshot`.
- product-level values such as `final_ipn_code` and `product_description`.
- source lineage (`source_header_id`, `source_detail_id`, `source_working_detail_id`, `source_session_id`).

### From selected setup/account context
- ruleset + namespace + header.
- account/customer/currency/language/country fields.
- application instance/name fields.

## Upsert behavior
- Route delegates to `saveConfigurationReference()`.
- Insert/update conflict target: `configuration_reference`.
- Existing references are updated with latest payload and `updated_at = now()`.
- `is_active` is enforced true in save payload.

## Automatic secondary sampler save
After canonical save success:
- write one row to `CPQ_sampler_result`.
- source snapshot rule is exactly the same (configure > start).
- finalize is not the sampler snapshot source.

## Failure boundaries

- Finalize failure blocks canonical save.
- Canonical save failure reports DB persistence error.
- Sampler auto-save failure does not rewrite canonical save history; it fails as secondary step.

## Schema dependency note
Runtime save code depends on live `cpq_configuration_references` columns that are present in Neon CSV exports, including canonical/source lineage columns. Keep `sql/schema.sql` aligned to avoid fresh-environment drift.
