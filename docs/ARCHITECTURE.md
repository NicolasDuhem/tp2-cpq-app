# ARCHITECTURE (manual CPQ lifecycle)

## Primary route
- `/cpq` is the main business workflow.
- `/bike-builder` is an alias to `/cpq`.

## Lifecycle model
1. `POST /api/cpq/init` → StartConfiguration.
2. `POST /api/cpq/configure` → apply manual option changes.
3. `POST /api/cpq/finalize` → FinalizeConfiguration on save.
4. `POST /api/cpq/configuration-references` → persist canonical save row from latest source state (`configure` preferred, fallback `startconfiguration`).
5. `POST /api/cpq/sampler-result` → auto-persist secondary sampler row only after canonical save succeeds (same source-state rule).
6. `POST /api/cpq/retrieve-configuration` → resolve saved row and start a fresh session from it.

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
  7. Save canonical row in `cpq_configuration_references` from row working state (not finalize payload body).
  8. Auto-save secondary sampler row in `CPQ_sampler_result` using same source state.
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
  - Select save source state: latest `configure`, else latest `startconfiguration`
  - Persist canonical row in `cpq_configuration_references` from selected source
  - Persist secondary sampler row in `CPQ_sampler_result` from selected source
  - Keep finalize response only as finalize metadata/audit (`finalize_response_json`)

## Secondary sampler capture architecture
- `/cpq` also exposes **Save current configuration to sampler** (secondary/manual support flow).
- Capture source is strictly:
  1. latest `POST /api/cpq/configure` response, or
  2. if no configure yet, latest `POST /api/cpq/init` response.
- Capture source explicitly excludes `POST /api/cpq/finalize`.
- `POST /api/cpq/sampler-result` persists one row into `CPQ_sampler_result`.
- Captured `json_result` includes CPQ context, bike summary, selected options, and debug/raw snippets.

## Retrieve architecture
- Retrieve is deterministic and reference-driven:
  - Resolve one row from `cpq_configuration_references`
  - Build StartConfiguration request from saved row data + configured instance
  - Start a new session and hydrate UI from returned configuration state

## Deprecated from primary flow
- Full legacy traversal UI is retired from `/cpq` manual save/retrieve.
- Sampler persistence remains available only as a manual secondary flow + image-management feeder.


## Setup UX architecture
- `/cpq/setup` Picture management is feature-tabbed (tabs generated from `cpq_image_management.feature_label`).
- Each selected feature view shows summary metrics: total, missing (0/4), with pictures (1+), completion %, and fully complete (4/4).
- Option/value mappings are edited through tile cards and a modal editor that saves via existing `PUT /api/cpq/setup/picture-management/:id`.
- Sync flow remains `POST /api/cpq/setup/picture-management/sync` and continues to seed `cpq_image_management` from `CPQ_sampler_result`.
- Internal UI ownership map is exposed at `/cpq/ui-docs`; UI label/data/code mapping should be updated with every UI change.
