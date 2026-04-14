# ARCHITECTURE (CPQ-only)

## Route architecture
- `/cpq`: **primary** CPQ Bike Builder page.
- `/cpq` traversal UX exposes one unified workflow: **Start configuration traversal**.
- `/bike-builder`: legacy alias route that performs a redirect to `/cpq`.
- `/cpq/setup`: setup console with exactly three tabs:
  1. Account code management
  2. Ruleset management
  3. Picture management
- `/cpq/results`: sampler result matrix (bike rows, dynamic feature columns, dynamic country/detailId columns).

## API architecture
### Runtime APIs (`/api/cpq/*`)
- `POST /api/cpq/init`: starts CPQ configuration session.
- `POST /api/cpq/configure`: applies one runtime selection update.
- `POST /api/cpq/image-layers`: resolves configured picture layers.
- `POST /api/cpq/sampler-result`: persists traversal snapshots with duplicate protection on `(ipn_code, country_code)`.

### Setup APIs (`/api/cpq/setup/*`)
- Account context management (`account-context`, `account-context/:id`).
- Ruleset management (`rulesets`, `rulesets/:id`).
- Picture management (`picture-management`, `picture-management/:id`, `picture-management/sync`).

## Naming decisions
- **Sampler** is the canonical technical term in code and SQL (`CPQ_sampler_result`).
- “Simpering” appears only as legacy wording and is treated as synonymous with sampler.
- Setup UI labels remain user-facing: account code management, ruleset management, picture management.

## Traversal design
- Traversal model is a dynamic state graph walk driven by CPQ responses.
- Traversal candidate source of truth is the visible Configurator dropdown model (`state.features`) already rendered in UI.
- For each discovered state, the app inspects currently selectable visible dropdown options, applies one change, calls `/configure`, then continues from the returned state.
- State revisits are reduced using a stable state signature of selected options.
- Progress estimate is lower-bound adaptive and built from visible dropdown choice counts only.
- Manual **Save Configuration** and traversal auto-save share the same persistence path (`POST /api/cpq/sampler-result`).
- Persistence uniqueness is enforced by `(ipn_code, country_code)`:
  - `country_code` comes from selected account context (`CPQ_setup_account_context`).
  - first discovered tuple is kept; later duplicates are skipped.

## Across-market retrieve/rebuild design
- Across-market mode uses CPQ retrieve semantics, not visible-dropdown replay.
- Canonical source identity for the currently loaded bike is tracked in runtime state:
  - `sourceHeaderId`
  - `sourceDetailId`
  - `ruleset`
  - `namespace`
  - optional `configurationReference`
- Per selected country, the app:
  1. builds a coherent market context from one `CPQ_setup_account_context` row
  2. generates a new target detailId
  3. calls StartConfiguration with `sourceHeaderDetail` pointing to canonical source identity
  4. hydrates/evaluates the new session with configure
  5. persists result with dedupe `(ipn_code, country_code)`
  6. waits 5000 ms before the next country
