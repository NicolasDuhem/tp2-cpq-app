# Canonical Save Capability Gap (historical note)

## Current status (as of this documentation refresh)

The active runtime save path does **not** invoke ProductConfigurator `CopyConfiguration`.
Canonical save is implemented by persisting canonical identity/context into `cpq_configuration_references` after finalize.

## Why this file is retained

A helper module exists (`lib/cpq/runtime/copy-configuration.ts`) for potential future copy-capability integration, but it is currently not wired into the active API routes.

## Practical implication

- Do not describe save flow as copy-backed in current operational docs.
- If copy-backed behavior is introduced later, update:
  - `CPQ_MANUAL_LIFECYCLE.md`
  - `CPQ_DATABASE_SAVE_FLOW.md`
  - `RETRIEVE_AND_REFERENCE_FLOW.md`
  - and this file.

## Potential future activation inputs (not currently active)
- `CPQ_COPY_CONFIGURATION_URL`
- `CPQ_COPY_API_KEY`
- `CPQ_COPY_TIMEOUT_MS`
- `CPQ_COPY_REQUEST_WRAPPER`
