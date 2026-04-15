# Process data and flow contracts

## 1) Manual lifecycle on `/cpq`

### StartConfiguration
- Triggered manually by **Start New Session**.
- Also retriggered when selected account or ruleset changes.
- Route: `POST /api/cpq/init`.
- Captures latest start snapshot for downstream save-source fallback.

### Configure
- Triggered by dropdown option changes.
- Route: `POST /api/cpq/configure`.
- Uses active session ID.
- Updates current state and latest configure snapshot.

### FinalizeConfiguration
- Triggered by **Save Configuration**.
- Route: `POST /api/cpq/finalize`.
- Finalize response is tracked and persisted as finalize metadata only.

### Canonical save to `cpq_configuration_references`
- Happens immediately after successful finalize.
- Route: `POST /api/cpq/configuration-references`.
- Canonical save source snapshot rule:
  1. latest configure snapshot,
  2. otherwise latest start snapshot,
  3. never finalize response body.

### Auto support write to `CPQ_sampler_result`
- After canonical save success, one sampler row is auto-inserted.
- Uses same snapshot source rule as canonical save.

### Retrieve by reference
- Triggered by **Retrieve Configuration**.
- Route: `POST /api/cpq/retrieve-configuration`.
- Resolves one `configuration_reference`, then calls StartConfiguration with saved context.

## 2) Sampler flow details

## Manual sampler save
- UI action: **Save current configuration to sampler**.
- Route: `POST /api/cpq/sampler-result`.
- Snapshot source rule:
  - latest Configure, else latest StartConfiguration.
  - finalize is explicitly excluded.

## `json_result` structure intent
The stored snapshot keeps a legacy-style shape with core sections:
- CPQ context (`ruleset`, `namespace`, header/detail/session/source IDs)
- bike summary (`description`, `ipn`, `price`)
- `selectedOptions[]` containing `featureLabel/featureId/optionLabel/optionId/optionValue`
- optional debug/raw snippets

## Sampler → image-management sync
- Route: `POST /api/cpq/setup/picture-management/sync`.
- Reads unprocessed sampler rows.
- Extracts selected options.
- Upserts unique `(feature_label, option_label, option_value)` into `cpq_image_management`.
- Marks sampler rows processed (`processed_for_image_sync = true`).

## 3) Picture management flow

On `/cpq/setup` Picture management tab:
- Feature tabs are generated dynamically from `feature_label`.
- Search and missing-only filters apply before tab grouping.
- Summary metrics are feature-scoped:
  - total rows
  - missing pictures (0/4)
  - with pictures (>=1)
  - completion %
  - fully complete (4/4)
- Tile click opens modal editor for picture links + activation/ignore flags.
- Feature-level **Ignore during /configure** toggle updates all rows of that feature.

## 4) Layered preview flow

- `/cpq` builds selected option triplets from current normalized state.
- Calls `POST /api/cpq/image-layers`.
- Server performs exact match on active `cpq_image_management` rows:
  - `(feature_label, option_label, option_value)` + `is_active=true`
- Output ordering rule:
  1. selected-option traversal order from current state,
  2. within each match, `picture_link_1..4` slot order.
- Download action composes resolved layers client-side into a PNG.

## 5) Combination + bulk configure flow

## Generation
- Uses active configurator state to generate row combinations.
- Stores stable feature identity metadata to survive session-specific feature IDs.

## Bulk run (`Configure all ticked items`)
Per selected row:
1. Start fresh session.
2. Re-map feature identity to fresh-session feature.
3. Resolve option inside mapped feature scope (no global matching).
4. Skip features flagged ignore-during-configure.
5. Skip configure call if target option already selected.
6. Finalize session.
7. Save canonical reference row.
8. Auto-save sampler support row.

## Diagnostics
- Row statuses: `pending`, `running`, `configured`, `finalized`, `saved`, `failed`.
- Failed rows expose **Inspect failure** modal with stage, summary, trace/session IDs, and last two requests/responses.
- After run completion, combination table keeps only originally ticked rows.
