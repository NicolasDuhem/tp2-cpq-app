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
- Save payload source-of-truth is **not** finalize response body:
  - preferred source: latest `Configure` response/state
  - fallback source: latest `StartConfiguration` response/state
  - finalize response is retained for lifecycle/audit metadata only.
- A unique `configuration_reference` is always generated server-side if not provided.
- Saved data includes retrieval context (ruleset/namespace/header/detail/account/application) and JSON snapshots.

### 5) Automatic secondary sampler write after canonical save
- If canonical save succeeds, app immediately writes one support row into `CPQ_sampler_result`.
- Auto sampler row uses the same source-state contract (latest Configure else latest StartConfiguration).
- Finalize response body is not used as sampler snapshot source.

### 6) Retrieve configuration
- User provides `configuration_reference`.
- App resolves row from `cpq_configuration_references`.
- App starts a fresh StartConfiguration using saved row values.
- UI is hydrated from that response in a new live session.

## Session closure and continuation
- Saving finalizes and closes current session.
- To continue editing or configure another bike, a new StartConfiguration must be created.

## Deprecated from primary process
- Traversal/sampler-driven manual save behavior is removed from the `/cpq` primary flow.

## Secondary process: manual sampler save (`CPQ_sampler_result`)

### Trigger
- User clicks **Save current configuration to sampler** on `/cpq`.

### Source-state contract (legacy-compatible)
- Capture from latest `Configure` response if available.
- If no configure occurred yet in current flow, capture from latest `StartConfiguration` response.
- Do **not** use `FinalizeConfiguration` response for this sampler capture path.

### Persistence contract (`POST /api/cpq/sampler-result`)
- Required: `ruleset`, `account_code` (trimmed + non-empty validation).
- Optional text fields are trimmed; empty string persisted as `null`.
- `json_result` is stored as jsonb; defaults to `{}` if missing.
- New rows start with `processed_for_image_sync = false`.

### Captured `json_result` shape
- `cpqContext`: ruleset, namespace, headerId, detailId, sessionId, sourceHeaderId, sourceDetailId.
- `bikeSummary`: description, ipn, price.
- `selectedOptions[]` (critical for sync), each entry includes:
  - `featureLabel`
  - `featureId`
  - `optionLabel`
  - `optionId`
  - `optionValue`
- optional debugging payloads (`debug`, `raw`).

## Secondary process: sync from sampler results (`cpq_image_management`)

### Trigger
- Setup page button **Sync from sampler results** → `POST /api/cpq/setup/picture-management/sync`.

### Batch behavior
1. Select source rows from `CPQ_sampler_result` where `processed_for_image_sync = false`, ordered by `id`.
2. For each row:
   - Parse `json_result.selectedOptions` array (if present).
   - Trim and extract `featureLabel`, `optionLabel`, `optionValue`.
   - Skip entries missing any of these fields.
   - De-duplicate in-run via key `featureLabel + '\0' + optionLabel + '\0' + optionValue`.
   - Mark current sampler row processed (`processed_for_image_sync = true`, `processed_for_image_sync_at = now()`).
3. Insert distinct combinations into `cpq_image_management` with `ON CONFLICT DO NOTHING`.
4. Continue after per-row errors; aggregate them in `syncErrors`.
5. Return summary:
   - `sourceRowsScanned`
   - `selectedOptionsScanned`
   - `distinctCombinationsFound`
   - `inserted`
   - `skippedExisting`
   - `samplerRowsMarkedProcessed`
   - `syncErrors`
   - `unprocessedRowsRemaining`
   - `total`

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


### Setup picture management UX contract
- Picture mappings are loaded from `GET /api/cpq/setup/picture-management` and grouped by `feature_label` tabs in the client UI.
- Feature summary metrics are computed client-side from loaded rows:
  - `missing`: rows with 0 populated picture links (`picture_link_1..4`)
  - `with pictures`: rows with at least 1 populated picture link
  - `completion`: `with pictures / total`
  - `fully complete`: rows with 4 populated links
- Editing occurs in a modal per unique `(feature_label, option_label, option_value)` tile and persists through `PUT /api/cpq/setup/picture-management/:id`.
- Sync from sampler behavior and DB semantics are unchanged.

### UI documentation governance
- `/cpq/ui-docs` is the internal map of visible UI labels to component ownership and data source contracts.
- Any UI update should include a same-PR update to this map.
