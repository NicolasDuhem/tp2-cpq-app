# ARCHITECTURE (CPQ-only)

## Route architecture
- `/cpq`: **primary** CPQ Bike Builder page.
- `/cpq` traversal UX exposes one unified workflow: **Start configuration traversal**.
- `/bike-builder`: legacy alias route that performs a redirect to `/cpq`.
- `/cpq/setup`: setup console with exactly three tabs:
  1. Account code management
  2. Ruleset management
  3. Picture management
- `/cpq/results`: latest sampler result browser by IPN.

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
- For each discovered state, the app inspects currently selectable options, applies one change, calls `/configure`, then continues from the returned state.
- State revisits are reduced using a stable state signature of selected options.
- Persistence uniqueness is enforced by `(ipn_code, country_code)`:
  - `country_code` comes from selected account context (`CPQ_setup_account_context`).
  - first discovered tuple is kept; later duplicates are skipped.
