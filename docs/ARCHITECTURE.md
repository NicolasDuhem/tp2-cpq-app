# ARCHITECTURE (manual CPQ lifecycle)

## Primary route
- `/cpq` is the main business workflow.
- `/bike-builder` is an alias to `/cpq`.

## Lifecycle model
1. `POST /api/cpq/init` → StartConfiguration.
2. `POST /api/cpq/configure` → apply manual option changes.
3. `POST /api/cpq/finalize` → FinalizeConfiguration on save.
4. `POST /api/cpq/configuration-references` → persist finalized save row.
5. `POST /api/cpq/retrieve-configuration` → resolve saved row and start a fresh session from it.

## Bulk combinations execution model (additive)
- Source data: generated combinations table on `/cpq`.
- Trigger: **Configure all ticked items**.
- Processing contract per selected row:
  1. Start a new session via `POST /api/cpq/init`.
  2. Re-map target features using stable feature identity from combination generation (`featureName` / feature-question metadata / `featureLabel`) to resolve the **current** session `featureId`.
  3. Resolve target option only inside the mapped feature’s `availableOptions`.
  4. Skip `/api/cpq/configure` when option is already selected in current state.
  5. After each configure call, replace row working state with response-parsed state before next feature.
  6. Finalize with `POST /api/cpq/finalize` payload `{ "sessionID": "<row session>" }`.
  7. Save finalized row in `cpq_configuration_references`.
- Sessions are never reused across selected rows.
- Debug timeline records all automated API calls (`Bulk:StartConfiguration`, `Bulk:Configure`, `Bulk:FinalizeConfiguration`, `Bulk:SaveConfigurationReference`).

## Session management rules
- Active session is scoped by `(ruleset, account_code)`.
- Changing either `ruleset` or `account_code` triggers a new StartConfiguration.
- Save triggers FinalizeConfiguration, which ends the active session.
- Further edits require a new StartConfiguration (new session).

## Save architecture
- Save does **not** use traversal/sampler persistence.
- Save path is deterministic:
  - Finalize live session
  - Capture finalized `detailId`
  - Persist in `cpq_configuration_references`

## Retrieve architecture
- Retrieve is deterministic and reference-driven:
  - Resolve one row from `cpq_configuration_references`
  - Build StartConfiguration request from saved row data + configured instance
  - Start a new session and hydrate UI from returned configuration state

## Deprecated from primary flow
- Traversal/sampler behaviors are retired from `/cpq` manual save/retrieve.
- `CPQ_sampler_result` remains for historical/result uses only.
