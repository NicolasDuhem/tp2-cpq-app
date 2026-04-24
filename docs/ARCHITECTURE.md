# Architecture (current implementation)

## 1) Application scope
This repository is a CPQ-focused Next.js app with operational setup, runtime configuration, sampler analytics, and sales allocation orchestration.

Primary routes:
- `/dashboard` (executive operations dashboard)
- `/cpq` (Bike Builder runtime)
- `/cpq/setup` (setup + picture management)
- `/cpq/results` (sampler matrix)
- `/cpq/process` (SOP content)
- `/cpq/ui-docs` (UI mapping table)
- `/sales/bike-allocation` (sales allocation matrix + launch-to-CPQ)

Aliases:
- `/` → `/cpq`
- `/bike-builder` → `/cpq`

## 2) Shell/navigation/auth model
- `app/layout.tsx` wraps pages in `AppShell`.
- `AppShell` provides brand header + nav + `AdminModeProvider`.
- Admin mode is client-side only (sessionStorage key `tp2-cpq-admin-mode`, password `Br0mpt0n`).
- Non-admin nav shows Process, Sales allocation, Bike Builder, Setup.
- Non-admin nav now also includes Dashboard.
- Admin nav additionally shows Sampler Results and UI Docs.

Important boundary: this is **not** server-enforced authentication/RBAC; it is UI visibility gating.

## 3) Page architecture
- `/cpq` → `components/cpq/bike-builder-page.tsx`
  - Start/Configure/Finalize lifecycle
  - canonical save/retrieve
  - sampler save
  - layered image preview
  - combination generation + bulk row-country execution
  - replay ingestion from sales launch context
- `/cpq/setup` → `components/setup/cpq-setup-page.tsx`
  - CRUD: account context/rulesets/country mappings
  - picture management editing
  - feature-level ignore + layer-order controls
  - sampler sync into `cpq_image_management`
- `/cpq/results` → `components/cpq/cpq-results-page.tsx` + client matrix component
- `/sales/bike-allocation` → server data loader + client matrix/toggle/bulk/replay launcher
- `/dashboard` → `lib/dashboard/service.ts` + `components/dashboard/dashboard-page.tsx`
  - Aggregates server-side data from sampler/config setup tables into KPI cards, territory map, stacked coverage bars, heatmap, picture completeness chart, actionable gap list, and ranked leaderboards.
  - Drill-down links route to `/sales/bike-allocation` and `/cpq/setup` with query-param context.
  - Page is explicitly dynamic and sales mutation routes revalidate `/sales/bike-allocation` to avoid stale server-component cache after Active/Inactive writes.
- `/cpq/process` and `/cpq/ui-docs` are static-ish client-doc pages.

## 4) API architecture
### CPQ runtime routes
- `POST /api/cpq/init`
- `POST /api/cpq/configure`
- `POST /api/cpq/finalize`
- `POST /api/cpq/retrieve-configuration`

### CPQ persistence/setup routes
- `POST/GET /api/cpq/configuration-references`
- `POST /api/cpq/sampler-result`
- `POST /api/cpq/image-layers`
- `GET/POST/PUT/DELETE /api/cpq/setup/account-context*`
- `GET/POST/PUT/DELETE /api/cpq/setup/country-mappings*`
- `GET/POST/PUT/DELETE /api/cpq/setup/rulesets*`
- `GET/PUT/POST /api/cpq/setup/picture-management*`

### Sales routes
- `POST /api/sales/bike-allocation/toggle`
- `POST /api/sales/bike-allocation/bulk-update`
- `POST /api/sales/bike-allocation/launch-context`
  - Toggle/bulk routes revalidate `/sales/bike-allocation` so App Router refresh picks up latest Neon state.

## 5) Data boundaries
- `cpq_configuration_references` = canonical saved configuration registry for retrieve.
- `CPQ_sampler_result` = support snapshots + sales allocation status source (`active`).
- `CPQ_setup_account_context`, `cpq_country_mappings`, `CPQ_setup_ruleset` = setup/master tables.
- `cpq_image_management` = layered preview mapping + feature-level bulk-ignore and layer order.
- Bike-type source of truth used by dashboard and sales deep-links: `CPQ_setup_ruleset.cpq_ruleset -> CPQ_setup_ruleset.bike_type`.

## 6) Feature flags/runtime switches
- `NEXT_PUBLIC_CPQ_DEBUG=true`: client debug timeline capture in `/cpq` (still admin-visible only).
- `CPQ_USE_MOCK=true`: mock responses for init/configure routes.

## 7) Known constraints
- UI admin mode is not security.
- `/cpq/results` can be opened directly by URL even when admin tab is hidden.
- `/cpq/ui-docs` route renders for all users, but its component content gates detailed table to admin mode.

## 8) CPQ context invariants
- One authoritative active CPQ context is maintained in `/cpq` state with owner + accountCode + countryCode + ruleset + sessionId (+ ids).
- Bike Builder setup loading filters out blank account codes and blocks session actions until a valid account code is selected.
- `init` context is driven by current UI `accountCode` + `ruleset` (including replay launch from sales), and init requests are sequenced so stale responses cannot win.
- Replay launch sequence is: apply UI account/ruleset → run init in that context → accept only latest init result → replay configure steps on that session → finalize/save in same context/session lineage.
- Finalize always reads session id from the authoritative active context (never stale/default/previous session refs).
- `CPQ_sampler_result.active` remains canonical for Sales Active/Inactive rendering.

## 9) QPart module architecture (isolated)
- Domain entry route: `/qpart` with child pages `/qpart/parts`, `/qpart/hierarchy`, `/qpart/metadata`, `/qpart/compatibility`.
- API namespace: `/api/qpart/*` only.
- Domain services: `lib/qpart/locales`, `lib/qpart/hierarchy`, `lib/qpart/metadata`, `lib/qpart/parts`, `lib/qpart/parts/csv-service`, `lib/qpart/compatibility`.
- Types: `types/qpart.ts`.

- QPart AI translation endpoint: `POST /api/qpart/translations/field` (server-only OpenAI call, field-by-field translation for core title/description plus translatable metadata, fill-missing by default).
- QPart CSV endpoints: `GET /api/qpart/parts/export` and `POST /api/qpart/parts/import` (supports dry-run summary + apply upsert by `part_number`).
- CSV contract is intentionally flat while writes remain normalized across qpart core/translation/metadata/compatibility tables.
- Isolation rule implemented: QPart only reads CPQ setup/sampler tables for dynamic reference data (locales, bike types, compatibility derivation). It does not hook into CPQ configure/finalize/runtime flows.

QPart source-of-truth reads from CPQ tables:
- locales: `CPQ_setup_account_context.language`
- bike types: `CPQ_setup_ruleset.bike_type`
- sampler compatibility candidates: `CPQ_sampler_result.json_result`


## 10) QPart AI translation (field scoped)
- Triggered inline from `/qpart/parts/new` + `/qpart/parts/[id]` on English title, English description, and each translatable metadata field.
- Server path only: browser calls QPart API route, route calls OpenAI with `OPENAI_API_KEY`; no key in client bundle.
- Locale targets are always derived from `CPQ_setup_account_context.language` via `/api/qpart/locales`.
- Base locale value is source-of-truth and is never replaced by AI output.
- Save policy currently uses fill-missing behavior (existing non-empty locale translations are skipped by default).
- Model default: `gpt-5.4-mini`, override with `OPENAI_TRANSLATION_MODEL`.
