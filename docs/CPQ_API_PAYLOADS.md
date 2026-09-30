# API payload contracts (current routes)

## CPQ runtime

## `POST /api/cpq/init`
Purpose: call StartConfiguration and normalize CPQ response.

Request (representative):
```json
{
  "ruleset": "BBLV6_G-LineMY26",
  "partName": "BBLV6_G-LineMY26",
  "namespace": "Default",
  "headerId": "Simulator",
  "detailId": "<uuid>",
  "sourceHeaderId": "",
  "sourceDetailId": "",
  "context": {
    "accountCode": "A000286",
    "company": "A000286",
    "accountType": "Dealer",
    "customerId": "A000286",
    "currency": "GBP",
    "language": "en-GB",
    "countryCode": "GB",
    "customerLocation": "GB"
  }
}
```

## `POST /api/cpq/configure`
Required: `sessionId`, `featureId`, `optionValue`.

```json
{
  "sessionId": "<session>",
  "featureId": "<feature-id>",
  "optionId": "<option-id>",
  "optionValue": "<option-value>",
  "ruleset": "BBLV6_G-LineMY26"
}
```

## `POST /api/cpq/finalize`
```json
{ "sessionID": "<session>" }
```
Errors:
- `missing_session_id` (400)
- `cpq_finalize_failed` (500)

## `POST /api/cpq/retrieve-configuration`
```json
{ "configuration_reference": "CFG-YYYYMMDD-XXXXXXXX" }
```
Returns resolved DB row + StartConfiguration input + new parsed session state.

## CPQ persistence

## `POST /api/cpq/configuration-references`
Upsert canonical configuration row in `cpq_configuration_references`.
Important request fields:
- identity: `configuration_reference?`, `canonical_header_id`, `canonical_detail_id`, `ruleset`, `namespace`
- session/source lineage and context fields
- `finalize_response_json` (object)
- `json_snapshot` (object)

## `GET /api/cpq/configuration-references?configuration_reference=...`
Returns active matching row or 404.

## `POST /api/cpq/sampler-result`
Inserts support snapshot row into `CPQ_sampler_result` with `active=true`.
Required:
- `ruleset`
- `account_code`

## Setup + picture management
- `GET/POST /api/cpq/setup/account-context`
- `PUT/DELETE /api/cpq/setup/account-context/[id]`
- `GET/POST /api/cpq/setup/rulesets`
- `PUT/DELETE /api/cpq/setup/rulesets/[id]`
- `GET /api/cpq/setup/picture-management`
- `PUT /api/cpq/setup/picture-management/[id]`
- `POST /api/cpq/setup/picture-management/sync`
- `GET /api/cpq/setup/picture-management/ignored-features`
- `PUT /api/cpq/setup/picture-management/feature-flags`

`PUT /api/cpq/setup/picture-management/feature-flags` body:
```json
{
  "feature_label": "<required>",
  "ignore_during_configure": true,
  "feature_layer_order": 10
}
```
- At least one of `ignore_during_configure` / `feature_layer_order` must be included.
- `feature_layer_order` must be integer `1..20`.
- Update scope is all rows with matching `feature_label`.

## Layered preview
## `POST /api/cpq/image-layers`
```json
{
  "selectedOptions": [
    { "featureLabel": "...", "optionLabel": "...", "optionValue": "..." }
  ]
}
```
Returns `layers[]`, `matchedSelections[]`, `unmatchedSelections[]`.

## Sales allocation APIs

## `POST /api/sales/bike-allocation/toggle`
```json
{
  "ruleset": "...",
  "ipnCode": "...",
  "countryCode": "...",
  "targetStatus": "active | not_active"
}
```
Writes `CPQ_sampler_result.active` for matching cell rows.

## `POST /api/sales/bike-allocation/bulk-update`
```json
{
  "ruleset": "...",
  "ipnCodes": ["..."],
  "countryCodes": ["..."],
  "targetStatus": "active | not_active"
}
```
Bulk updates `CPQ_sampler_result.active` for matching ruleset/IPN/country sets.
`ipnCodes` is exactly the set of bikes on the operator's **current page**, and
`countryCodes` is the explicit Territory selection. The route records
`scope: 'current_page'` on the audit rows. Requires Edit on `sales.bike_allocation`.

## `POST /api/sales/bike-allocation/bulk-push`
```json
{
  "ruleset": "...",
  "ipnCodes": ["..."],
  "countryCodes": ["..."]
}
```
Re-pushes current-page bike/country rows to external `variants` then
`variant_eligibilities`. Does **not** change `active`. Requires Edit.

## `POST /api/sales/bike-allocation/push`
```json
{ "ruleset": "...", "ipnCode": "...", "countryCode": "..." }
```
Single-cell external push, BC-gated. Requires Edit.

## `GET /api/sales/bike-allocation/export`

Query parameters: the same contract as the page (`ruleset`, `bike_type`, `countries`,
`country_code`, `ipn`, `status`, `features`). `page` / `page_size` are ignored — the export
always covers every page of the filtered dataset.

Response: `text/csv; charset=utf-8` with a UTF-8 BOM and a
`Content-Disposition: attachment` filename of `bike-allocation_<YYYY-MM-DD_HHMM>.csv`.

Columns: `ipn_code`, `ruleset`, `bike_type`, `country_code`, `region`, `sub_region`,
`allocation_status` (`Active` | `Inactive`), `bc_ready` (`yes` | `no`), then one column per
available feature label.

One row per bike x country. `not_configured` pairs are excluded: they have no allocation
row. Read-only, so Read on `sales.bike_allocation` is sufficient.

## `POST /api/sales/bike-allocation/external-status`
```json
{
  "filters": {
    "ruleset": "...",
    "bike_type": "...",
    "countryCodes": ["GB"],
    "ipnSearch": "...",
    "allocationStatuses": ["active", "not_active", "not_configured"],
    "featureFilters": { "Frame Colour": "green" }
  }
}
```
**Contract change (2026-09-30):** this route previously took `filters` plus a separate
`filterCriteria` object (`ipnFilter`, `featureFilters`, `countryStatusFilters`). Territory,
status and search filtering now all live on `filters`, so a single object describes the
dataset and `filterCriteria` is no longer read. Read-only; requires Read. The server
rebuilds the filtered dataset across every page and performs one batched
`variant_eligibilities` lookup, never a per-cell query.

## `POST /api/sales/bike-allocation/launch-context`
```json
{
  "ruleset": "...",
  "ipnCode": "...",
  "countryCode": "..."
}
```
Returns launch context (`ruleset`, `countryCode`, `accountCode`) + replay options resolved from sampler JSON payload.

## Admin CPQ replay validation (read-only)

## `GET /api/admin/cpq-replay-validation/options`
```json
{ "bikeTypes": ["..."], "countries": ["GB"], "bikeTypeSource": "...", "countrySource": "..." }
```

## `GET /api/admin/cpq-replay-validation/references`
Query: `bikeType` (required), `countryCode` (required), `limit` (optional, default 100, max 500).
```json
{
  "rows": [
    {
      "id": 1,
      "configurationReference": "CFG-YYYYMMDD-XXXXXXXX",
      "countryCode": "GB",
      "bikeType": "...",
      "ruleset": "...",
      "existingItemCode": "...",
      "productDescription": "...",
      "accountCode": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "limit": 100,
  "maxLimit": 500
}
```
`json_snapshot` / `finalize_response_json` are never selected by this route.

## `POST /api/admin/cpq-replay-validation/run`
```json
{ "referenceIds": [1, 2], "limit": 10 }
```
Default batch 10, hard max 25, processed sequentially. Response:
```json
{
  "results": [
    {
      "referenceId": 1,
      "configurationReference": "CFG-...",
      "countryCode": "GB",
      "bikeType": "...",
      "existingItemCode": "...",
      "replayedItemCode": "...",
      "finalizedItemCode": "...",
      "replayedDetailId": "...",
      "replaySessionId": "...",
      "status": "match | different | failed | skipped",
      "message": "...",
      "error": "...",
      "durationMs": 1234,
      "selectionSource": "sampler:detail_id | sampler:session_id | sampler:ipn_ruleset_country | cpq-source-copy | none",
      "steps": []
    }
  ],
  "summary": { "total": 1, "match": 1, "different": 0, "failed": 0, "skipped": 0 },
  "readOnly": true
}
```
This route calls CPQ StartConfiguration/Configure/FinalizeConfiguration only. It performs no Neon writes, no sampler write, no configuration-reference write, no audit write, no external PostgreSQL push and no BigCommerce update.

## `POST /api/admin/cpq-replay-validation/overwrite`
Requires Admin on `admin.cpq_replay_validation`. Archives before updating; updates existing rows only.

Request (the server re-runs the replay itself; no replay payload is accepted from the client):
```json
{
  "overwriteBatchId": "optional client label, stored in archive metadata only",
  "rows": [
    {
      "configurationReferenceId": 123,
      "configurationReference": "CFG-YYYYMMDD-XXXXXXXX",
      "existingItemCode": "...",
      "countryCode": "GB",
      "bikeType": "...",
      "ruleset": "..."
    }
  ]
}
```
`configurationReferenceId` and `configurationReference` are required per row; the remaining fields are optional assertions validated against the live row (mismatch → `skipped`). Max 25 rows.

Response:
```json
{
  "overwriteBatchId": "<server-generated uuid>",
  "summary": { "total": 1, "updated": 1, "skipped": 0, "failed": 0 },
  "results": [
    {
      "configurationReferenceId": 123,
      "configurationReference": "CFG-...",
      "existingItemCode": "IPN-OLD",
      "replayedItemCode": "IPN-NEW",
      "status": "updated | skipped | failed",
      "message": "...",
      "error": "...",
      "archiveId": 1,
      "samplerResultId": 45,
      "replayStatus": "different",
      "durationMs": 4200
    }
  ],
  "archivedBeforeUpdate": true,
  "externalSideEffects": false
}
```
No external PostgreSQL push, no BigCommerce write, no allocation audit row, and no live row is ever inserted.

### `POST /api/admin/cpq-replay-validation/overwrite` — external eligibility result (2026-08-13)

Each entry in `results` may now carry the outcome of the targeted external PostgreSQL update:
```json
{
  "externalEligibilityDetailUpdate": {
    "attempted": true,
    "updatedRows": 1,
    "status": "updated | skipped | warning | failed",
    "message": "...",
    "sku": "IPN-OLD-111",
    "countryCode": "GB",
    "previousDetailId": "detail-old-1",
    "newDetailId": "detail-new-999"
  }
}
```
`summary` also gains `externalUpdated`, `externalSkipped`, `externalWarning` and `externalFailed`.

The response's top-level flags are now `externalVariantsUpdated: false`, `externalRowsInserted: false` and `bigcommerceUpdated: false` — only `variant_eligibilities."DetailId"` is written externally.
