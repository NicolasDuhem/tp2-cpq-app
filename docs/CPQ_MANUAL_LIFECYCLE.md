# CPQ manual lifecycle (strict contract)

## Scope
This document defines the canonical manual lifecycle behavior implemented on `/cpq`.

## Lifecycle sequence
1. `StartConfiguration` (`POST /api/cpq/init`)
2. `Configure` (`POST /api/cpq/configure`) zero or more times
3. `FinalizeConfiguration` (`POST /api/cpq/finalize`)
4. Canonical save (`POST /api/cpq/configuration-references`)
5. Optional/automatic sampler support save (`POST /api/cpq/sampler-result`)
6. Retrieve (`POST /api/cpq/retrieve-configuration`) by `configuration_reference`

## Identity model

### Working identity (session-scoped)
- `sessionId` + current working `detailId` during live editing.

### Canonical identity (persisted)
- `configuration_reference` + canonical header/detail context in `cpq_configuration_references`.

## Save-source rule (critical)
Canonical save payload is built from:
1. latest configure response snapshot,
2. otherwise latest start response snapshot.

It is **not** built from finalize response body.

Finalize response is stored as `finalize_response_json` for audit/debug only.

## Session behavior
- Changing ruleset/account context starts a fresh session.
- Save/finalize closes current manual session state in UI.
- User must start/retrieve again to continue editing.

## Canonical table rule
- `cpq_configuration_references` is the source of truth for manual save/retrieve.
- `CPQ_sampler_result` is secondary/supporting only.

## Retrieve behavior
- Resolve row by `configuration_reference` from canonical table.
- Build StartConfiguration input from persisted row context.
- Start a new CPQ session and hydrate UI from that response.

## Explicit non-contracts
- No active CopyConfiguration step is invoked in the current runtime path.
- No finalize-body-as-snapshot behavior is allowed.
