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
- New sampler rows persist with `active = true` by default (canonical sales allocation flag).

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
- Insert behavior:
  - `active` is always set to `true` on creation.
  - `active` (real DB column) is canonical for Sales allocation status.
  - `json_result.active` is not used as canonical status.

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
- Feature-level **Layer order (1 = top layer)** updates all rows of that feature.
  - Validation: integer only, `1..20`.
  - Default/backfill: `10`.

## 4) Layered preview flow

- `/cpq` builds selected option triplets from current normalized state.
- Calls `POST /api/cpq/image-layers`.
- Server performs exact match on active `cpq_image_management` rows:
  - `(feature_label, option_label, option_value)` + `is_active=true`
- Output ordering rule:
  1. feature layer order (`feature_layer_order`) descending for render traversal (so `1` draws last and appears on top),
  2. within each match, `picture_link_1..4` slot order.
- Download action composes resolved layers client-side into a PNG.

## 5) Combination + bulk configure flow

## Generation
- Uses active configurator state to generate row combinations.
- Stores stable feature identity metadata to survive session-specific feature IDs.
- Builds one checkbox country column per distinct active setup-account `country_code`.
- Exposes operational-grid UX:
  - feature-driven filter panel generated from `combinationDataset` rows (dynamic features + dynamic values),
  - OR-within-feature and AND-across-features filtering,
  - selected-only filter,
  - per-column show/hide,
  - visible-row bulk selection (`Select all visible rows`, `Unselect all visible rows`),
  - visible-row bulk country actions (tick/untick selected countries on visible selected rows),
  - scrollable table container.

## Validation before bulk run
- A row with main `Select` checked must have at least one country checked.
- Missing-country rows are highlighted and bulk run is blocked with a user-facing validation message.

## Bulk run (`Configure all ticked items`)
Per selected **row-country** pair:
1. Start fresh session.
2. Resolve setup account context by selected country.
3. Build StartConfiguration context from that country row (`account_code/company`, `customer_id`, `currency`, `language`, `country_code/customerLocation`, dealer account type).
4. Re-map feature identity to fresh-session feature.
5. Resolve option inside mapped feature scope (no global matching).
6. Skip features flagged ignore-during-configure.
7. Skip configure call if target option already selected.
8. Finalize session.
9. Save canonical reference row.
10. Auto-save sampler support row.

## Progress model
- Bulk progress is tracked on row-country executions (not just rows): selected rows, country assignments, total executions, current row/country/feature, succeeded/failed/saved counters.

## Diagnostics
- Row statuses: `pending`, `running`, `configured`, `finalized`, `saved`, `failed`.
- Failed rows preserve execution metadata including country code and execution key.
- **Inspect failure** modal includes stage, summary, trace/session IDs, country, and last two requests/responses.
- Feature remap diagnostics capture:
  - source feature label/id,
  - resolved target feature label/id,
  - feature match strategy (`stable-identity`, `exact-label`, `normalized-label`, `suffix-tolerant-label`, `fuzzy`),
  - source option value/label,
  - resolved option value/id/label,
  - fallback usage flag when suffix-tolerant or fuzzy matching is used.
- Structured remap failures are explicit (no silent skip):
  - `feature_not_matched_safely` with considered candidates,
  - `option_not_matched_within_feature` with option candidates within the resolved feature only.

## Feature/option normalization rules used by bulk remap
- Case-insensitive comparison.
- Trim + collapse repeated spaces.
- Punctuation-tolerant normalized labels/values.
- Locale suffix tolerance for features (e.g. `_FR`, `-FR`, `_FR_CA`).
- Cautious fuzzy matching is only accepted when score threshold is met and winner is unambiguous.


## 6) Admin visibility gating
- Top ribbon includes **Open as admin** (password `Br0mpt0n`) for internal UI visibility control.
- Non-admin users see only operational routes in nav: Process, Bike Builder, Setup.
- Admin-only Bike Builder runtime/technical lines:
  - Session
  - DetailId
  - IPN
  - Save status
  - Save source tracker
  - Last finalize response tracked
  - Sampler save status
  - Retrieve status
  - Bulk run
  - Bulk current session
  - Bulk current feature
- CPQ debug timeline is admin-only.

## 7) Bike Builder layout + scroll behavior
- Top controls are compacted (account/ruleset selectors + primary action buttons + retrieve input).
- Main workspace uses a desktop two-column layout: configurator (left) and layered preview (right).
- Configurator has internal scroll for long feature lists.
- Generated combinations table remains in a bounded scroll container for horizontal/vertical overflow.
- Admin mode can increase page height due to extra technical/debug areas; standard mode is optimized for compact usage around 1920x1080.
