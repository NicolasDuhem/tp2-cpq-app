# CPQ Manual Lifecycle Review (Current Implementation)

## Scope and intent

This review covers only the manual CPQ lifecycle currently implemented in the app:

1. `StartConfiguration`
2. `Configure`
3. `FinalizeConfiguration`
4. Save finalized reference in Neon (`cpq_configuration_references`)

It explicitly excludes the historical sampler traversal flow (`CPQ_sampler_result`) as the canonical manual save path.

## Additive bulk lifecycle (combinations table)

The `/cpq` page now also supports **Configure all ticked items** from generated combinations.
This does not replace the manual lifecycle; it orchestrates the same Start → Configure → Finalize → Save pattern per selected row.

Key invariants:
- Each selected row runs in a fresh StartConfiguration session.
- `featureId` is re-mapped from each fresh session model (never reused from original generated session).
- Option matching is feature-scoped (option lookup happens inside the mapped feature only).
- Configure calls are skipped when row target option already matches current selected option.
- Every automation call is written into the debug timeline using `Bulk:*` actions.

---

## End-to-end narrative (frontend → app API → CPQ → parsing/state → DB)

## 1) StartConfiguration

### Frontend trigger and dependencies

- The lifecycle page is `components/cpq/bike-builder-page.tsx`.
- Setup data is loaded from:
  - `GET /api/cpq/setup/account-context?activeOnly=true`
  - `GET /api/cpq/setup/rulesets?activeOnly=true`
- As soon as both `accountCode` and `ruleset` are set, a `useEffect` triggers `startConfiguration()`.
- `startConfiguration()` is also manually triggerable via **Start New Session** button.
- Session reset behavior is intentional:
  - dependency array: `[accountCode, ruleset]`
  - changing either causes a new StartConfiguration call and replaces state.

### Frontend request payload sent to app

`bike-builder-page.tsx` sends this to `POST /api/cpq/init`:

```json
{
  "ruleset": "<selected ruleset>",
  "partName": "<selected ruleset>",
  "namespace": "<selected ruleset namespace>",
  "headerId": "<selected ruleset header_id>",
  "detailId": "<new random UUID per start>",
  "sourceHeaderId": "",
  "sourceDetailId": "",
  "context": {
    "accountCode": "<account_code>",
    "company": "<account_code>",
    "accountType": "Dealer",
    "customerId": "<customer_id>",
    "currency": "<currency>",
    "language": "<language>",
    "countryCode": "<country_code>",
    "customerLocation": "<country_code>"
  }
}
```

### App API route and CPQ call

- Route: `app/api/cpq/init/route.ts`
- Route composes CPQ payload using `buildStartConfigurationPayload()` in `lib/cpq/runtime/config.ts`.
- Backend CPQ endpoint called by `startConfiguration()` client: `POST {CPQ_BASE_URL}/StartConfiguration`.

### CPQ request JSON (exact constructed shape)

```json
{
  "inputParameters": {
    "mode": 0,
    "profile": "<profile>",
    "variantKey": null,
    "application": {
      "instance": "<instance>",
      "name": "<instance>"
    },
    "part": {
      "namespace": "<namespace>",
      "name": "<partName/ruleset>"
    },
    "headerDetail": {
      "headerId": "<headerId>",
      "detailId": "<detailId>"
    },
    "sourceHeaderDetail": {
      "headerId": "<sourceHeaderId>",
      "detailId": "<sourceDetailId>"
    },
    "integrationParameters": [
      { "name": "AccountType", "simpleValue": "<AccountType>", "isNull": false, "type": "string" },
      { "name": "CurrencyCode", "simpleValue": "<CurrencyCode>", "isNull": false, "type": "string" },
      { "name": "Company", "simpleValue": "<Company>", "isNull": false, "type": "string" },
      { "name": "AccountCode", "simpleValue": "<AccountCode>", "isNull": false, "type": "string" },
      { "name": "CustomerId", "simpleValue": "<CustomerId>", "isNull": false, "type": "string" },
      { "name": "LanguageCode", "simpleValue": "<LanguageCode>", "isNull": false, "type": "string" },
      { "name": "CustomerLocation", "simpleValue": "<CustomerLocation>", "isNull": false, "type": "string" }
    ],
    "rapidOptions": null
  }
}
```

`CustomerId` and `LanguageCode` are conditionally included only when non-empty.

### Response parsing and frontend state update

- CPQ response is normalized through `mapCpqToNormalizedState()`.
- Parser extracts (best-effort, via direct fields + recursive scans):
  - `sessionId` (`SessionId`/`ConfigurationSessionId` etc.)
  - `detailId` (`DetailId`/`ConfigurationId` etc.)
  - source IDs (`sourceHeaderId`, `sourceDetailId`)
  - `configurationReference`
  - IPN code and source trace
  - screen/page/options to build visible feature model
- `bike-builder-page.tsx` stores parsed state in `state` and marks `manualSessionClosedRef.current = false`.

---

## 2) Configure

### Frontend action/handler

- Per-feature `<select>` change calls `configureOption(featureId, option)`.
- Guard: requires `state.sessionId` and `manualSessionClosedRef.current === false`.

### Frontend → app API payload

`POST /api/cpq/configure` payload:

```json
{
  "sessionId": "<active sessionId>",
  "featureId": "<feature id>",
  "optionId": "<option.optionId>",
  "optionValue": "<option.value or option.optionId>",
  "ruleset": "<selected ruleset>",
  "context": {
    "accountCode": "<account_code>",
    "customerId": "<customer_id>",
    "currency": "<currency>",
    "language": "<language>",
    "countryCode": "<country_code>"
  }
}
```

### App API route and downstream CPQ call

- Route: `app/api/cpq/configure/route.ts`
- Route builds downstream CPQ body as:

```json
{
  "sessionID": "<sessionId>",
  "selections": [
    { "id": "<featureId>", "value": "<optionValue>" }
  ]
}
```

- Backend CPQ endpoint called by runtime client: `POST {CPQ_BASE_URL}/configure` (lowercase path).

### Response parsing and state mutation

- CPQ response normalized via `mapCpqToNormalizedState()`.
- If parser cannot find session and returns `unknown-session`, route falls back to request session id.
- Frontend replaces full `state` with parsed response.
- This updates feature list, selected values, IPN, descriptions, pricing-derived fields, and possibly refreshed `detailId` depending on CPQ payload content.

---

## 3) FinalizeConfiguration

### Frontend save trigger

- **Save Configuration** button triggers `saveConfiguration()`.
- Guard: active `state.sessionId` and selected account must exist.

### Finalize payload and critical rule compliance

`saveConfiguration()` sends to `POST /api/cpq/finalize`:

```json
{ "sessionID": "<active sessionId>" }
```

This matches the intended rule (“Finalize sends only sessionID”).

### App route and backend CPQ call

- Route: `app/api/cpq/finalize/route.ts`
- Validates non-empty `sessionID`.
- Calls runtime client `finalizeConfiguration(sessionId)`.
- Runtime CPQ endpoint: `POST {CPQ_BASE_URL}/FinalizeConfiguration`.

### Finalize response handling

`lib/cpq/runtime/client.ts` finalization rules:

- Parses JSON if possible; also keeps raw text.
- Computes `hasExplicitError` if parsed body contains `error`, `errors`, `exception`, or `success === false`.
- Treats finalize as success when `HTTP 200 && !hasExplicitError`.
- Therefore HTTP 200 + empty body is accepted as success and returns `{}`.

`saveConfiguration()` then computes finalized detail id as:

1. `finalizeResult.payload.parsed.detailId`
2. fallback to pre-finalize `state.detailId`

If still empty, save flow aborts with error.

### Session closure behavior

After successful DB save, UI explicitly closes manual session:

- `manualSessionClosedRef.current = true`
- `setState(null)`

This prevents further Configure calls on a finalized session from current screen state.

---

## 4) Save finalized configuration into Neon

### Canonical route and table

- Save route: `POST /api/cpq/configuration-references`
- Canonical table: `cpq_configuration_references`
- This path is the manual save implementation.

### Frontend payload to save route

After finalize success, frontend sends save payload where content source is selected as:

- latest `Configure` parsed/raw state when available
- otherwise latest `StartConfiguration` parsed/raw state
- never finalize response body as canonical snapshot source

Then frontend sends a large object containing:

- Canonical identity:
  - `ruleset`, `namespace`, `canonical_header_id`, `canonical_detail_id`
- Finalized identity and lineage:
  - `header_id`, `finalized_detail_id`, `source_working_detail_id`, `source_session_id`, `source_header_id`, `source_detail_id`, `finalized_session_id`
- Account/runtime context:
  - `account_code`, `customer_id`, `account_type`, `company`, `currency`, `language`, `country_code`, `customer_location`
- App metadata:
  - `application_instance`, `application_name`
- Product outputs:
  - `final_ipn_code`, `product_description` (from selected Configure/Start source state)
- Debug/audit JSON blobs:
  - `finalize_response_json` (audit/lifecycle only)
  - `json_snapshot` (selected Configure/Start parsed state + selected options + source marker + raw finalize + timestamp)

### Database mapping behavior

`saveConfigurationReference()` does the following:

- Generates `configuration_reference` when missing:
  - `CFG-YYYYMMDD-<8 uppercase UUID chars>`
- Requires:
  - `ruleset`, `namespace`, `canonical_detail_id` (or fallback `finalized_detail_id`)
- Defaults:
  - `canonical_header_id` fallback to `header_id`, else `'Simulator'`
  - `header_id` fallback to canonical header
  - `finalized_detail_id` fallback to canonical detail
- Validates `finalize_response_json` and `json_snapshot` as JSON objects (not arrays/primitives).
- Upserts by `configuration_reference`.

### Response to UI

- On success route returns `{ traceId, row }` (201).
- UI stores `row` as `lastSavedReference`, fills retrieve input with `configuration_reference`, shows success message.
- UI then automatically writes one secondary row to `CPQ_sampler_result` using the same selected Configure/Start source snapshot.
- On failure returns 400 with `db_persistence_failed` category and details; UI shows error.

---

## sessionID / detailId / configuration_reference lifecycle

- `sessionId`:
  - Created by CPQ on StartConfiguration.
  - Reused for Configure calls while account/ruleset unchanged and session not manually closed.
  - Ends logically at finalize + save in UI (state cleared and manualSessionClosedRef set).
- Working `detailId`:
  - Parsed from Start/Configure responses.
  - May change as CPQ evolves state.
  - Stored as `source_working_detail_id` during save.
- Finalized `detailId`:
  - Preferred from finalize parsed payload detailId.
  - Fallback to working `state.detailId` if finalize returns empty body.
  - Persisted as both `canonical_detail_id` and `finalized_detail_id`.
- `configuration_reference`:
  - Generated at save if not provided.
  - Persisted unique key for retrieve flow.

---

## Frontend/runtime state inventory

`bike-builder-page.tsx` runtime state includes:

- selection context: `accountCode`, `ruleset`, resolved setup rows
- live CPQ state: full `NormalizedBikeBuilderState`
- control refs: `manualSessionClosedRef` to block configure post-finalize
- save/retrieve UI statuses and messages
- debug timeline (if `NEXT_PUBLIC_CPQ_DEBUG=true`)

`NormalizedBikeBuilderState` contains parsed CPQ fields, visible features/options, hidden/system features, and raw payload for debug.

---

## Correctness checks (what is implemented correctly)

1. Start is correctly re-triggered on account/ruleset change, resetting runtime session state.
2. Configure is session-driven and only sends single selection delta against current session.
3. Finalize payload enforces sessionID-only contract.
4. Finalize treats 200 empty body as success unless explicit error markers exist.
5. Save happens only after finalize success and persists canonical reference data in `cpq_configuration_references`.
6. Retrieve path uses `cpq_configuration_references` and rehydrates via StartConfiguration with canonical IDs.
7. Debug tracing exists at client timeline + api/cpq/db server logs with trace IDs.

---

## Gaps, assumptions, fragility

1. **Schema drift risk**
   - `saveConfigurationReference()` inserts columns `canonical_header_id`, `canonical_detail_id`, `source_working_detail_id`, `source_session_id`, but `sql/schema.sql` currently does not declare these columns in `cpq_configuration_references`.
   - This implies migration drift or bootstrap mismatch risk in fresh environments.

2. **Finalize detailId dependency fallback**
   - When finalize returns empty body, final detail identity relies on prior working state detailId; if parser never extracted detailId earlier, save fails.

3. **Parser heuristic dependence**
   - `mapCpqToNormalizedState()` relies on recursive key heuristics (case variants, caption matching). CPQ contract changes could silently degrade extraction quality.

4. **No explicit frontend “session version” token**
   - rapid changes to account/ruleset could race asynchronous start calls; last response wins by timing (no cancellation token check).

5. **Configure endpoint casing sensitivity**
   - Uses `/configure` while Start/Finalize use capitalized paths. If CPQ becomes case-sensitive differently across environments, this could fail.

6. **Canonical-vs-finalized semantics are collapsed**
   - Save currently stores same value for canonical and finalized detail IDs in normal path. That may be fine now, but semantics are future-coupled.

---

## Canonical path confirmation

- `CPQ_sampler_result` is still present for sampler/image-management workflows, but is not used by manual save/retrieve flow.
- Manual canonical persistence and retrieval are implemented through `cpq_configuration_references` + `/api/cpq/configuration-references` + `/api/cpq/retrieve-configuration`.
