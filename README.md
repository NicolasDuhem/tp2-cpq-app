# tp2-cpq-app

CPQ-only Next.js application focused on a **manual-first CPQ lifecycle**.

## Primary workflow (`/cpq`)
1. **StartConfiguration** opens a live session for `(ruleset + account_code)`.
2. **Configure** updates options in that same active session.
3. **FinalizeConfiguration** is called when the user clicks **Save Configuration**.
4. The finalized state is persisted to `cpq_configuration_references`.
5. **Retrieve Configuration** resolves one `configuration_reference` and starts a fresh session from the saved reference data.

## Session rules
- Same `sessionId` stays active while `ruleset` and `account_code` stay unchanged.
- Changing `ruleset` starts a new session.
- Changing `account_code` starts a new session.
- Saving calls `FinalizeConfiguration`, which closes the current session.
- After save/finalize, the user must start (or retrieve) a new session to continue.

## What changed
- `/cpq` now prioritizes one clean manual process.
- Traversal/sampler-based save behavior is removed from the primary `/cpq` flow.
- Canonical manual save/retrieve now uses `cpq_configuration_references`.
- `CPQ_sampler_result` remains as historical/output support and is not the canonical manual save registry.

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
- Setup APIs under `/api/cpq/setup/*`

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
