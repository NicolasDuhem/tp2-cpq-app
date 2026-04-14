# Retrieve and Reference Flow

## Identity split
- **Runtime working identity**: current `sessionId` + working `detailId` used for live `/api/cpq/configure` calls.
- **Canonical retrievable identity**: persisted `canonical_header_id` + `canonical_detail_id` + `configuration_reference` in `cpq_configuration_references`.

## Save configuration reference
1. User loads/builds a bike in `/cpq`.
2. User clicks **Save configuration reference**.
3. App persists (or updates) one row in `cpq_configuration_references` through `POST /api/cpq/configuration-references`.
4. Returned `configuration_reference` is shown and can be reused later.

## Retrieve configuration
1. User enters `configuration_reference` and clicks **Retrieve configuration**.
2. App resolves the canonical row through `POST /api/cpq/retrieve-configuration`.
3. App creates a **new working detailId**.
4. App calls StartConfiguration via `/api/cpq/init` with:
   - `headerDetail.detailId = new working detailId`
   - `sourceHeaderDetail.headerId = canonical_header_id`
   - `sourceHeaderDetail.detailId = canonical_detail_id`
5. App runs a Configure hydration step and rebuilds the visible bike state from CPQ responses.

## Current integration gap vs legacy copy semantics
- The new app does not currently call a dedicated CPQ host-side **Copy** API to materialize a canonical detail at save time.
- Current best-effort approach stores the best available canonical source identity from CPQ responses; fallback uses current working detail when CPQ does not provide explicit source detail.
