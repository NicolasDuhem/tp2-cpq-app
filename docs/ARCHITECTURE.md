# ARCHITECTURE (CPQ-only)

## Route architecture
- `/cpq`: **primary** CPQ Bike Builder page.
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
- `POST /api/cpq/sampler-result`: persists sampler snapshots.

### Setup APIs (`/api/cpq/setup/*`)
- Account context management (`account-context`, `account-context/:id`).
- Ruleset management (`rulesets`, `rulesets/:id`).
- Picture management (`picture-management`, `picture-management/:id`, `picture-management/sync`).

## Naming decisions
- **Sampler** is the canonical technical term in code and SQL (`CPQ_sampler_result`).
- “Simpering” appears only as legacy wording and is treated as synonymous with sampler.
- Setup UI labels remain user-facing: account code management, ruleset management, picture management.
