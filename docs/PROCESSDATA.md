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
