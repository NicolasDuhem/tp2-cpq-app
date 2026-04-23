# CPQ database save flow

## Canonical persistence path (`/cpq`)
1. Finalize active session (`/api/cpq/finalize`)
2. Derive finalized detail identity
3. Build canonical payload from latest Configure snapshot (fallback Start)
4. Upsert `cpq_configuration_references` by `configuration_reference`
5. Write support snapshot row to `CPQ_sampler_result` (`active=true`)

## Canonical payload composition
### Finalize-derived
- `canonical_detail_id` / `finalized_detail_id`
- `finalize_response_json`

### Snapshot-derived (configure preferred)
- normalized parsed state + selected options into `json_snapshot`
- product values (for example `final_ipn_code`, `product_description`)
- source lineage fields

### Setup/context-derived
- ruleset/namespace/header
- account/customer/currency/language/country context
- application instance/name

## Upsert behavior
- conflict target: `configuration_reference`
- updates existing row payload and `updated_at`
- `is_active` written true by save path

## Failure boundaries
- Finalize failure blocks canonical DB save.
- Canonical save failure returns persistence error.
- Auto sampler save failure occurs after canonical write attempt and is reported as secondary failure.

## Data ownership reminder
- Canonical retrieve path uses `cpq_configuration_references`.
- Sales allocation status uses `CPQ_sampler_result.active`.
