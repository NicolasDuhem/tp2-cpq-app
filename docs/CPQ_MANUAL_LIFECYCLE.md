# CPQ manual lifecycle (strict contract)

## Scope
Defines behavior implemented on `/cpq` for a single working session.

## Lifecycle sequence
1. `POST /api/cpq/init`
2. `POST /api/cpq/configure` (0..n)
3. `POST /api/cpq/finalize`
4. `POST /api/cpq/configuration-references`
5. Auto/optional support save to `POST /api/cpq/sampler-result`
6. `POST /api/cpq/retrieve-configuration` (separate retrieval action)

## Identity model
### Working identity
- `sessionId` (active CPQ session)
- working `detailId`

### Canonical persisted identity
- `configuration_reference`
- canonical header/detail context in `cpq_configuration_references`

## Save-source rule (critical)
Canonical save snapshot is built from:
1) latest Configure snapshot, fallback
2) latest Start snapshot.

Finalize response is captured as metadata (`finalize_response_json`) and is not the snapshot source.

## Session behavior
- Account/ruleset selection changes trigger a fresh init.
- Successful finalize+save closes the current manual session state in UI.

## Canonical table rule
- Canonical source for retrieve: `cpq_configuration_references`.
- `CPQ_sampler_result` is support/analytics/allocation data and not canonical retrieve source.

## Explicit non-contracts
- No active CopyConfiguration call in runtime save flow.
- No server-side auth/RBAC enforcement in lifecycle APIs.
