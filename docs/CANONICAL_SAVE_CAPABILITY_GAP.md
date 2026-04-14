# Canonical Save Capability Gap

## Current status (new app)
- **Canonical save is only considered legacy-equivalent when ProductConfigurator `CopyConfiguration` is configured and reachable from the backend.**
- The backend now attempts canonical save in this order:
  1. Generate a new canonical `targetDetailId`
  2. Call ProductConfigurator `CopyConfiguration` (or equivalent endpoint configured by env)
  3. Persist `cpq_configuration_references` only after copy succeeds
- If copy capability is not configured, `POST /api/cpq/configuration-references` returns `501` and no canonical reference row is written.

## Required capability
To enable canonical save, set:
- `CPQ_COPY_CONFIGURATION_URL` (required): full backend URL for CopyConfiguration-style operation.
- `CPQ_COPY_API_KEY` (optional): API key used for copy endpoint (falls back to `CPQ_API_KEY`).
- `CPQ_COPY_TIMEOUT_MS` (optional): timeout for copy request.
- `CPQ_COPY_REQUEST_WRAPPER` (optional): set to `inputParameters` only if endpoint expects wrapped payload.

## Why this exists
Legacy flow relied on host-side copy semantics before persisting retrievable identity. Without a real copy call, retrieve remains approximation-only and can break when source/working identities diverge.
