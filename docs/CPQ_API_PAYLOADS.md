# CPQ API payload contracts (active routes)

## Runtime routes

## `POST /api/cpq/init`
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
Response includes:
- `traceId`
- `sessionId`
- `parsed` (`NormalizedBikeBuilderState`)
- `rawResponse`
- `requestBody`
- `callType = "StartConfiguration"`

## `POST /api/cpq/configure`
Required request fields: `sessionId`, `featureId`, `optionValue`.
Representative request:
```json
{
  "sessionId": "<session>",
  "featureId": "<feature>",
  "optionId": "<option-id>",
  "optionValue": "<option-value>",
  "ruleset": "BBLV6_G-LineMY26"
}
```
Response includes parsed state, raw response, trace metadata, and downstream request/response echoes.

## `POST /api/cpq/finalize`
Request:
```json
{ "sessionID": "<active-session>" }
```
Error categories:
- `missing_session_id` (400)
- `cpq_finalize_failed` (500)

## `POST /api/cpq/retrieve-configuration`
Request:
```json
{ "configuration_reference": "CFG-YYYYMMDD-XXXXXXXX" }
```
Response includes:
- resolved canonical row (`resolved`)
- built StartConfiguration input (`startConfigurationInput`)
- new session + parsed state (`sessionId`, `parsed`)

## Persistence routes

## `POST /api/cpq/configuration-references`
Request accepts canonical save payload fields, including:
- identity: `configuration_reference`, `canonical_header_id`, `canonical_detail_id`, `ruleset`, `namespace`
- lineage/session/context fields
- JSONB fields: `finalize_response_json`, `json_snapshot`

Success response:
```json
{ "traceId": "<uuid>", "row": { "id": 123, "configuration_reference": "CFG-..." } }
```

## `GET /api/cpq/configuration-references`
Query param:
- `configuration_reference`

Returns row if found and active, else 404.

## `POST /api/cpq/sampler-result`
Required:
- `ruleset`
- `account_code`

Optional:
- IPN/account context/header/detail/session fields
- `json_result`

Response:
```json
{ "status": "inserted", "row": { "id": 1, "created_at": "..." } }
```

## Setup routes

- `GET/POST /api/cpq/setup/account-context`
- `PUT/DELETE /api/cpq/setup/account-context/[id]`
- `GET/POST /api/cpq/setup/rulesets`
- `PUT/DELETE /api/cpq/setup/rulesets/[id]`
- `GET /api/cpq/setup/picture-management`
- `PUT /api/cpq/setup/picture-management/[id]`
- `POST /api/cpq/setup/picture-management/sync`
- `PUT /api/cpq/setup/picture-management/feature-flags`
- `GET /api/cpq/setup/picture-management/ignored-features`

## Layer route

## `POST /api/cpq/image-layers`
Request:
```json
{
  "selectedOptions": [
    { "featureLabel": "...", "optionLabel": "...", "optionValue": "..." }
  ]
}
```
Response:
- `layers[]`
- `matchedSelections[]`
- `unmatchedSelections[]`
