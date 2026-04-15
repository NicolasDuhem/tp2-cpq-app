# CPQ API Payloads (Manual Lifecycle)

This document enumerates request/response payload shapes used in the current manual flow implementation.

---

## 1) StartConfiguration

## Frontend → app route

**Route**: `POST /api/cpq/init`

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

## App route → CPQ

**Endpoint**: `POST {CPQ_BASE_URL}/StartConfiguration`

```json
{
  "inputParameters": {
    "mode": 0,
    "profile": "Default",
    "variantKey": null,
    "application": { "instance": "BROMPTON_TRN", "name": "BROMPTON_TRN" },
    "part": { "namespace": "Default", "name": "BBLV6_G-LineMY26" },
    "headerDetail": { "headerId": "Simulator", "detailId": "<uuid>" },
    "sourceHeaderDetail": { "headerId": "", "detailId": "" },
    "integrationParameters": [
      { "name": "AccountType", "simpleValue": "Dealer", "isNull": false, "type": "string" },
      { "name": "CurrencyCode", "simpleValue": "GBP", "isNull": false, "type": "string" },
      { "name": "Company", "simpleValue": "A000286", "isNull": false, "type": "string" },
      { "name": "AccountCode", "simpleValue": "A000286", "isNull": false, "type": "string" },
      { "name": "CustomerId", "simpleValue": "A000286", "isNull": false, "type": "string" },
      { "name": "LanguageCode", "simpleValue": "en-GB", "isNull": false, "type": "string" },
      { "name": "CustomerLocation", "simpleValue": "GB", "isNull": false, "type": "string" }
    ],
    "rapidOptions": null
  }
}
```

## App route response → frontend

```json
{
  "traceId": "<uuid>",
  "sessionId": "<parsed session>",
  "parsed": "<NormalizedBikeBuilderState>",
  "rawResponse": "<raw CPQ response>",
  "requestBody": "<exact CPQ request body>",
  "callType": "StartConfiguration"
}
```

Error shape:

```json
{
  "traceId": "<uuid>",
  "error": "CPQ init failed",
  "details": "<message>"
}
```

---

## 2) Configure

## Frontend → app route

**Route**: `POST /api/cpq/configure`

```json
{
  "sessionId": "<active session>",
  "featureId": "<feature id>",
  "optionId": "<option id>",
  "optionValue": "<option value>",
  "ruleset": "BBLV6_G-LineMY26",
  "context": {
    "accountCode": "A000286",
    "customerId": "A000286",
    "currency": "GBP",
    "language": "en-GB",
    "countryCode": "GB"
  }
}
```

Validation rule in route:

- required: `sessionId`, `featureId`, `optionValue`

## App route → CPQ

**Endpoint**: `POST {CPQ_BASE_URL}/configure`

```json
{
  "sessionID": "<active session>",
  "selections": [
    { "id": "<feature id>", "value": "<option value>" }
  ]
}
```

## App route response → frontend

```json
{
  "traceId": "<uuid>",
  "sessionId": "<parsed/fallback session>",
  "parsed": "<NormalizedBikeBuilderState>",
  "rawResponse": "<raw CPQ response>",
  "requestBody": { "sessionID": "...", "selections": [{ "id": "...", "value": "..." }] },
  "downstreamRequestBody": { "sessionID": "...", "selections": [{ "id": "...", "value": "..." }] },
  "downstreamResponseBody": "<raw CPQ response>",
  "callType": "Configure"
}
```

Error shape:

```json
{
  "traceId": "<uuid>",
  "error": "CPQ configure failed",
  "details": "<message>"
}
```

---

## 3) FinalizeConfiguration

## Frontend → app route

**Route**: `POST /api/cpq/finalize`

```json
{ "sessionID": "<active session>" }
```

## App route → CPQ

**Endpoint**: `POST {CPQ_BASE_URL}/FinalizeConfiguration`

```json
{ "sessionID": "<active session>" }
```

## Finalize success rules in runtime client

Finalize is considered success when:

- HTTP status is `200`
- parsed body does **not** indicate explicit error keys (`error`, `errors`, `exception`, `success:false`)

`200` + empty body is accepted and returned as `{}`.

## App route response → frontend

```json
{
  "traceId": "<uuid>",
  "sessionId": "<same input session>",
  "parsed": "<NormalizedBikeBuilderState from CPQ response or empty mapping>",
  "rawResponse": "<raw CPQ response JSON or {}>",
  "callType": "FinalizeConfiguration"
}
```

Error shapes:

```json
{ "traceId": "<uuid>", "error": "Missing session ID before finalize", "errorCategory": "missing_session_id" }
```

```json
{
  "traceId": "<uuid>",
  "error": "Finalize request rejected by CPQ",
  "errorCategory": "cpq_finalize_failed",
  "details": "<message>"
}
```

---

## 4) Save finalized reference (Neon)

## Frontend → app route

**Route**: `POST /api/cpq/configuration-references`

Representative payload:

```json
{
  "ruleset": "BBLV6_G-LineMY26",
  "namespace": "Default",
  "canonical_header_id": "Simulator",
  "canonical_detail_id": "<final detail id>",
  "header_id": "Simulator",
  "finalized_detail_id": "<final detail id>",
  "source_working_detail_id": "<working detail id before finalize>",
  "source_session_id": "<session id>",
  "source_header_id": "<source header id or Simulator>",
  "source_detail_id": "<source detail id or null>",
  "account_code": "A000286",
  "customer_id": "A000286",
  "account_type": "Dealer",
  "company": "A000286",
  "currency": "GBP",
  "language": "en-GB",
  "country_code": "GB",
  "customer_location": "GB",
  "application_instance": "<NEXT_PUBLIC_CPQ_INSTANCE|null>",
  "application_name": "<NEXT_PUBLIC_CPQ_INSTANCE|null>",
  "finalized_session_id": "<session id>",
  "final_ipn_code": "<ipn|null>",
  "product_description": "<description|null>",
  "finalize_response_json": "<raw finalize response object>",
  "json_snapshot": {
    "parsed": "<normalized parsed state>",
    "finalizeRawResponse": "<raw finalize response>",
    "retrievedAt": "<ISO timestamp>"
  }
}
```

## App route/db response

Success (201):

```json
{
  "traceId": "<uuid>",
  "row": {
    "id": 123,
    "configuration_reference": "CFG-20260415-1A2B3C4D",
    "ruleset": "...",
    "namespace": "...",
    "finalized_detail_id": "...",
    "...": "..."
  }
}
```

Failure (400):

```json
{
  "traceId": "<uuid>",
  "error": "Finalize succeeded but saving reference in database failed",
  "errorCategory": "db_persistence_failed",
  "details": "<validation/db error>"
}
```

---

## 5) Retrieve by configuration_reference

## Frontend → app route

**Route**: `POST /api/cpq/retrieve-configuration`

```json
{ "configuration_reference": "CFG-YYYYMMDD-XXXXXXXX" }
```

## Route behavior

1. Resolves active row from `cpq_configuration_references`.
2. Builds `StartConfiguration` input from persisted canonical/source/account fields.
3. Calls CPQ StartConfiguration.
4. Returns resolved row + parsed live session.

Success response includes:

```json
{
  "traceId": "<uuid>",
  "resolved": "<row from cpq_configuration_references>",
  "startConfigurationInput": "<constructed start input>",
  "sessionId": "<new session>",
  "parsed": "<NormalizedBikeBuilderState>",
  "rawResponse": "<raw CPQ response>",
  "callType": "StartConfiguration"
}
```

