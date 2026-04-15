# tp2-cpq-app

CPQ-only Next.js application focused on a **manual-first CPQ lifecycle**.

## Primary workflow (`/cpq`)
1. **StartConfiguration** opens a live session for `(ruleset + account_code)`.
2. **Configure** updates options in that same active session.
3. **FinalizeConfiguration** is called when the user clicks **Save Configuration**.
4. The finalized state is persisted to `cpq_configuration_references`.
5. **Retrieve Configuration** resolves one `configuration_reference` and starts a fresh session from the saved reference data.

## Bulk workflow from combinations table
- Generate combinations from the current active session and tick one or more rows.
- Click **Configure all ticked items** to run an automated per-row lifecycle:
  1. Start a **fresh** session for the row (`StartConfiguration`).
  2. Re-map each target feature against the fresh session model (never reuse old `featureId`).
  3. Resolve option matches **inside the mapped feature scope only** (no global option matching).
  4. Call `/configure` only when the target option is not already selected.
  5. Finalize with `{ "sessionID": "<active row session>" }`.
  6. Save into `cpq_configuration_references`.
- Every selected row runs in a brand-new session and appears in the debug timeline with `Bulk:*` actions.

## Session rules
- Same `sessionId` stays active while `ruleset` and `account_code` stay unchanged.
- Changing `ruleset` starts a new session.
- Changing `account_code` starts a new session.
- Saving calls `FinalizeConfiguration`, which closes the current session.
- After save/finalize, the user must start (or retrieve) a new session to continue.

## What changed
- `/cpq` now prioritizes one clean manual process.
- Canonical manual save/retrieve now uses `cpq_configuration_references`.
- `CPQ_sampler_result` is now a **secondary manual support flow**:
  - `/cpq` can manually save the latest active configurator state to sampler results.
  - This sampler save uses latest `Configure` response; if none exists yet, latest `StartConfiguration` response.
  - Sampler save never uses `FinalizeConfiguration` as capture source.
- `CPQ_sampler_result` is not the canonical manual save registry (that remains `cpq_configuration_references`).

## Routes
- `/cpq` (primary manual CPQ page)
- `/bike-builder` (alias route to `/cpq`)
- `/cpq/setup`
- `/cpq/results` (historical sampler result matrix)

## APIs
- `POST /api/cpq/init`
- `POST /api/cpq/configure`
- `POST /api/cpq/finalize`
- `POST /api/cpq/configuration-references`
- `GET /api/cpq/configuration-references?configuration_reference=...`
- `POST /api/cpq/retrieve-configuration`
- `POST /api/cpq/sampler-result`
- Setup APIs under `/api/cpq/setup/*`
  - including `POST /api/cpq/setup/picture-management/sync`

## Quick start
```bash
npm install
cp .env.example .env.local
psql "$DATABASE_URL" -f sql/schema.sql
psql "$DATABASE_URL" -f sql/seed.sql
npm run dev
```

## Environment
- `CPQ_INSTANCE` controls server-side `application.instance` and `application.name` in StartConfiguration.
- `NEXT_PUBLIC_CPQ_INSTANCE` mirrors the instance in client save metadata for traceability.
- Keep both aligned (`BROMPTON_TRN` sandbox, `BROMPTON_PRD` production).

## Documentation
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/PROCESSDATA.md`
