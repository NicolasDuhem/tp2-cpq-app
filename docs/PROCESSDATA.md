# Process data and flow contracts

## 1) `/cpq` manual lifecycle
1. StartConfiguration: `POST /api/cpq/init`
2. Configure (0..n): `POST /api/cpq/configure`
3. Finalize: `POST /api/cpq/finalize`
4. Canonical save: `POST /api/cpq/configuration-references`
5. Auto sampler save: `POST /api/cpq/sampler-result`
6. Optional retrieve by reference: `POST /api/cpq/retrieve-configuration`

### Critical save-source rule
Canonical `json_snapshot` and sampler payload source are:
- latest Configure snapshot, else
- latest Start snapshot,
- never Finalize response body.

## 2) `/cpq` bulk combination flow
- Generate cartesian combinations from visible, selectable feature options.
- User selects rows + assigns one/many countries per row.
- Validation blocks run if any selected row has zero countries.
- Execution unit is row-country pair:
  1) fresh init,
  2) feature remap,
  3) option remap within mapped feature,
  4) configure steps (skip ignored features / already selected options),
  5) finalize,
  6) canonical save,
  7) sampler save.
- Row status + failure diagnostics are persisted client-side for inspection.

## 3) Picture-management workflow (`/cpq/setup`)
- Sync step scans unprocessed sampler rows, extracts `json_result.selectedOptions`, inserts missing mapping rows.
- Feature-level controls:
  - `ignore_during_configure`
  - `feature_layer_order` (`1..20`, 1 = top visual layer)
- Option-level modal edits links `picture_link_1..4` and `is_active`.

## 4) Layered preview flow (`/cpq`)
- Current selected options are posted to `/api/cpq/image-layers`.
- Resolver matches exact `(featureLabel, optionLabel, optionValue)` against active `cpq_image_management` rows.
- Returned links are rendered with layer order and downloadable as merged client PNG.

## 5) Sales allocation workflow (`/sales/bike-allocation`)
### Status matrix
- Data source: grouped `CPQ_sampler_result` rows by `ruleset + ipn_code + country_code`.
- Status logic:
  - any `active=true` → Active
  - rows exist but all inactive → Inactive
  - no rows → Not configured

### User actions
- Click Active/Inactive cell → toggle `CPQ_sampler_result.active` via `/api/sales/bike-allocation/toggle`.
- Bulk activate/deactivate visible IPNs across selected countries via `/api/sales/bike-allocation/bulk-update`.
- Click Not configured → resolve launch context (`/api/sales/bike-allocation/launch-context`) then navigate to `/cpq` with replay token.

### Replay handoff
- Sales page stores replay payload in `sessionStorage` key `tp2-cpq-launch-replay:<token>`.
- `/cpq` reads token payload, applies account/ruleset in UI, waits for init completion, then replays options through normal configure API with remap logic.

## 6) Access/visibility model
- Admin mode is a UI gate (sessionStorage + static password), not server auth.
- Some capabilities are hidden in navigation unless admin mode is on.
- `/cpq/ui-docs` content itself is admin-gated in component render.

## 7) Runtime toggles
- `NEXT_PUBLIC_CPQ_DEBUG=true`: debug timeline capture in `/cpq`.
- `CPQ_USE_MOCK=true`: mock CPQ init/configure responses in API routes.
