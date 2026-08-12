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

## `POST /api/sales/bike-allocation/launch-context`
```json
{
  "ruleset": "...",
  "ipnCode": "...",
  "countryCode": "..."
}
```
Returns launch context (`ruleset`, `countryCode`, `accountCode`) + replay options resolved from sampler JSON payload.
