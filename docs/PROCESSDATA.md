# PROCESSDATA

## Manual CPQ lifecycle (authoritative)

### 1) StartConfiguration
- Triggered when `/cpq` loads with valid setup selections.
- Triggered again when `ruleset` changes.
- Triggered again when `account_code` changes.
- Starts one live session and returns `sessionId` + current `detailId`.

### 2) Configure
- Every manual dropdown change calls `POST /api/cpq/configure`.
- Uses the currently active `sessionId`.
- UI state is hydrated from each Configure response.

### 3) FinalizeConfiguration
- Triggered by **Save Configuration**.
- Calls `POST /api/cpq/finalize` with active `sessionId`.
- Finalize closes the active session and returns finalized state identity.

### 4) Save finalized configuration
- After finalize succeeds, app writes one row to `cpq_configuration_references`.
- A unique `configuration_reference` is always generated server-side if not provided.
- Saved data includes retrieval context (ruleset/namespace/header/detail/account/application) and JSON snapshots.

### 5) Retrieve configuration
- User provides `configuration_reference`.
- App resolves row from `cpq_configuration_references`.
- App starts a fresh StartConfiguration using saved row values.
- UI is hydrated from that response in a new live session.

## Session closure and continuation
- Saving finalizes and closes current session.
- To continue editing or configure another bike, a new StartConfiguration must be created.

## Deprecated from primary process
- Traversal/sampler-driven manual save behavior is removed from the `/cpq` primary flow.

## Bulk "Configure all ticked items" process data

### Trigger and row scope
- User generates combinations, ticks rows, and clicks **Configure all ticked items**.
- Only ticked rows are processed.
- Status/progress is tracked globally and per row (`pending`, `running`, `configured`, `finalized`, `saved`, `failed`).

### Per-row lifecycle
1. **Start fresh session**
   - Calls `POST /api/cpq/init`.
   - Produces a fresh `sessionId` and a fresh feature/option model.
2. **Feature remap in current session**
   - Uses stable feature identity saved in the combination dataset.
   - Re-resolves current `featureId` from the new session model.
3. **Feature-scoped option resolve**
   - Resolves option only from the mapped feature’s `availableOptions`.
   - Never performs global option matching across all features.
4. **Configure loop**
   - Compares target option with current selected option/value.
   - Skips `/api/cpq/configure` if already matching.
   - If different, calls configure and refreshes current row state from response before continuing.
5. **Finalize**
   - Calls `POST /api/cpq/finalize` with `{ "sessionID": "<row session>" }`.
6. **Save**
   - Calls `POST /api/cpq/configuration-references` using existing manual save schema.

### Multi-row behavior
- Next selected row always starts with a brand-new StartConfiguration call.
- No session reuse across rows.
- Failures are isolated to the current row; processing continues to remaining selected rows.

### Debug trace visibility
- Automated calls are timeline-visible with `Bulk:*` action names.
- This keeps app request/response and route-level CPQ traceability aligned with manual debugging.
