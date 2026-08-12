# MAIN_APP_DEEP_DIVE (current app)

## Scope
This document summarizes behavior implemented in code as of this refresh.

## 1) Runtime surfaces
- CPQ runtime: `/cpq`
- Setup/admin: `/cpq/setup`
- Results matrix: `/cpq/results`
- Process docs: `/cpq/process`
- UI docs table: `/cpq/ui-docs`
- Sales allocation: `/sales/bike-allocation`

## 2) Core contracts
### Canonical lifecycle
`/cpq` runs init → configure → finalize → canonical save, then writes support sampler snapshot.

### Save source
Canonical and sampler snapshot payloads use configure snapshot fallback start snapshot (not finalize body).

### Canonical retrieval
`configuration_reference` resolves from `cpq_configuration_references`, then starts a new CPQ session.

## 3) Bulk execution model
- Generate combinations from current CPQ state.
- Queue = selected row-country pairs.
- Each queue item starts fresh init and runs full finalize/save flow.
- Feature/option remap uses exact/normalized/suffix-tolerant/fuzzy safety checks.
- Features flagged `ignore_during_configure` are skipped.

## 4) Sales allocation integration
- Matrix status is derived from `CPQ_sampler_result.active`.
- Active/Inactive cells toggle DB status directly.
- Not configured cell resolves launch context and opens `/cpq` with replay token.
- Replay payload is passed through sessionStorage and configured via normal `/api/cpq/configure` flow.

## 5) Data layer summary
- `cpq_configuration_references`: canonical save/retrieve registry.
- `CPQ_sampler_result`: support snapshots + allocation status + picture sync source.
- `CPQ_setup_account_context`, `CPQ_setup_ruleset`: setup data.
- `cpq_image_management`: layer link mappings + feature flags.

## 6) Visibility/security boundary
- Admin mode is a UI-only visibility gate.
- It does not protect APIs at server layer.
- `/cpq/ui-docs` content is guarded in component by admin mode state.

## 7) Runtime switches
- `NEXT_PUBLIC_CPQ_DEBUG=true`: collect/show debug timeline (admin view).
- `CPQ_USE_MOCK=true`: mock init/configure APIs.
