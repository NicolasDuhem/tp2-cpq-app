# tp2-cpq-app

Next.js CPQ operations app for bike configuration, setup management, sampler analytics, and sales allocation handoff.

## Current routes
- `/` → redirect to `/cpq`.
- `/bike-builder` → redirect to `/cpq`.
- `/cpq` → Bike Builder runtime (manual + bulk CPQ flow, save/retrieve, layered preview).
- `/cpq/setup` → setup console for account context, rulesets, and picture management.
- `/cpq/results` → sampler matrix explorer (admin-tab link only, route itself is not server-blocked).
- `/cpq/process` → SOP/process instruction page.
- `/dashboard` → executive operational dashboard (territory coverage, bike-type health, picture completeness, and gap leaderboards).
- `/cpq/ui-docs` → UI-label-to-code mapping page (content is admin-mode gated in UI component).
- `/admin/data-point` → internal admin page contract and data-point lineage viewer (admin mode only).
- `/sales/bike-allocation` → sales allocation matrix with active/inactive toggles and replay launch to `/cpq`.
  - Includes per-cell **Push** action to upsert bike row-country records into external PostgreSQL `cpq_sampler_result` using business key `(namespace, ipn_code, country_code)`.
  - Supports route filters `country_code`, `ruleset`, and `bike_type` for deep-link drill-down from dashboard views.
  - Toggle/bulk mutations revalidate + refresh the route so UI status updates immediately from `CPQ_sampler_result.active`.
- `/sales/qpart-allocation` → sales territory allocation matrix for QPart spare parts.
  - Includes per-cell **Push** action to upsert qpart row-country records into external PostgreSQL `cpq_sampler_result` using business key `(namespace, ipn_code, country_code)`.
  - Active/Inactive only (no Not configured state).
  - Part and territory matrix state is stored in `qpart_country_allocation.active`.
  - Toggle/bulk mutations revalidate + refresh the route so UI updates immediately.

## Core lifecycle contract (`/cpq`)
1. `POST /api/cpq/init` (StartConfiguration)
2. `POST /api/cpq/configure` (zero or more)
3. `POST /api/cpq/finalize`
4. `POST /api/cpq/configuration-references` (canonical save)
5. Auto-support save to `CPQ_sampler_result` via `POST /api/cpq/sampler-result`
6. Retrieve by `configuration_reference` via `POST /api/cpq/retrieve-configuration`

Canonical snapshot source for save/sampler is latest Configure snapshot, fallback latest Start snapshot (never Finalize body).

### `/cpq` init trigger contract
- `POST /api/cpq/init` is re-run whenever account code changes in UI.
- `POST /api/cpq/init` is re-run whenever ruleset changes in UI.
- Each init request is sequenced; only the latest init response is accepted as active context (stale responses are ignored).
- Sales “Not configured” launch takes temporary ownership of CPQ context: apply account/ruleset in UI → run init with those live values → accept latest init only → replay configure options on that same active session.
- Finalize/save always read session/ruleset/account from the authoritative active CPQ context set by the accepted init (not from stale/default session refs).

## Data ownership summary
- Canonical save/retrieve: `cpq_configuration_references`
- Operational/support snapshots and allocation state: `CPQ_sampler_result` (`active` is authoritative for sales allocation status: Active=true, Inactive=false, Not configured=no row)
- QPart sales territory allocation state: `qpart_country_allocation` (`active` is authoritative, one row per `part_id + country_code`)
- Setup master data: `CPQ_setup_account_context`, `CPQ_setup_ruleset`
- Layered preview + bulk-ignore behavior: `cpq_image_management`
- Dashboard aggregation source: `CPQ_sampler_result` + `CPQ_setup_ruleset` bike-type mapping + `cpq_country_mappings` territory metadata + `cpq_image_management` completeness status

## Admin mode and visibility
- Client-side admin visibility gate in top nav (`Open as admin`, password `Br0mpt0n`).
- Always-visible tabs: Process, Sales allocation, Bike Builder, Setup.
- Admin-only tabs: Sampler Results, UI Docs.
- `/cpq` technical/debug sections additionally require admin mode.

## Feature flags / runtime switches
- `NEXT_PUBLIC_CPQ_DEBUG=true` enables client debug timeline (still admin-only visible).
- `CPQ_USE_MOCK=true` switches `/api/cpq/init` and `/api/cpq/configure` to mock responses.

## Documentation
See `docs/README.md` for the full documentation map, including deep architecture, page/component breakdown, and gap analysis.
- `/qpart` → QPart spare-parts PIM landing page.
- `/qpart/parts` → spare part search/list and edit links.
- `/qpart/parts` also supports CSV export/import (dry-run preview + apply upsert by `part_number`).
- `/qpart/parts/new` and `/qpart/parts/[id]` → create/edit spare parts with hierarchy, metadata, translations, and compatibility.
- `/qpart/hierarchy` → hierarchy level 1..7 management.
- `/qpart/metadata` → metadata definition management.
- `/qpart/compatibility` → compatibility reference values and sampler derivation preview.

## QPart isolation summary
- Namespace isolation: routes are under `/qpart`, APIs under `/api/qpart/*`, services under `lib/qpart/*`, and tables are prefixed `qpart_`.
- CPQ/runtime pages (`/cpq`, `/cpq/setup`, `/sales/*`, dashboard) remain unchanged in behavior and do not depend on QPart tables at runtime.
- Dynamic locale source for QPart translations: `CPQ_setup_account_context.language` (distinct values).
- Dynamic bike type source: `CPQ_setup_ruleset.bike_type` (distinct values).
- Dynamic compatibility derivation source: `CPQ_sampler_result.json_result` (`selectedOptions` preferred, `dropdownOrderSnapshot` fallback).
- Dynamic country source for QPart sales allocation: active `cpq_country_mappings.country_code`.
- QPart allocation sync rule: missing `(part_id, country_code)` rows are auto-created as inactive on part create and during matrix load/mutation paths.
- QPart CSV export/import contract is intentionally flat/business-facing while persistence stays normalized in `qpart_*` tables.
- CSV metadata columns are dynamic from active `qpart_metadata_definitions` (`metadata__<key>` + `metadata__<key>__<locale>` for translatable definitions).
- CSV translation locale columns are dynamic from distinct `CPQ_setup_account_context.language` values (`title__<locale>`, `description__<locale>`, non-base locales only).


## QPart AI translation configuration
- `OPENAI_API_KEY` (required): server-side key for `POST /api/qpart/translations/field`.
- `OPENAI_TRANSLATION_MODEL` (optional): defaults to `gpt-5.4-mini`.
- QPart field translation is server-side only and never exposes API keys in browser code.
- Supported translation locales stay dynamic from distinct `CPQ_setup_account_context.language` values (excluding base locale).


## External PostgreSQL row push configuration
The row-level **Push** action on `/sales/bike-allocation` and `/sales/qpart-allocation` writes to an external PostgreSQL table (`cpq_sampler_result`) server-side only.

Runtime dependency requirement:
- `pg` must be present in production dependencies (not just devDependencies) so server-side push routes can load the Node PostgreSQL client at runtime (for example in Vercel serverless functions).

Required environment variables:
- `EXTERNAL_PG_HOST`
- `EXTERNAL_PG_PORT` (default `5432`)
- `EXTERNAL_PG_DATABASE`
- `EXTERNAL_PG_USER`
- `EXTERNAL_PG_PASSWORD`
- `EXTERNAL_PG_SSL` (`true` recommended for Azure PostgreSQL)
- `EXTERNAL_PG_SCHEMA` (default `public`)

Important: external upsert matching relies on unique business key `(namespace, ipn_code, country_code)` in the destination table. Ensure this index/constraint exists before using Push:

```sql
create unique index if not exists cpq_sampler_result_namespace_ipn_country_uniq
  on public.cpq_sampler_result(namespace, ipn_code, country_code);
```

## Live Neon metadata source of truth
- Live schema intelligence exports are in `database-intelligence/` and should be treated as the primary runtime DB reference for performance/schema validation.
- Important: files in this repo currently use capitalized names (for example `Schema.csv`, `Constraints.csv`, `Indexes.csv`, `Table_sizes.csv`), and there is currently no `database-intelligence/README.md`.
- For Neon load analysis and optimization planning, use those CSV exports first, then reconcile with code.


## QPart image upload (v1)
- QPart detail page now has a compact **Take picture** action beside the QPart code (mobile camera-capable via `accept=image/*` + `capture=environment`).
- Selected image is resized client-side (max dimension 1600px, aspect ratio preserved) and re-encoded as JPEG at quality 0.82 before upload.
- Upload target uses Vercel Blob public store with deterministic key: `qparts/<part_number>.jpg` and overwrite enabled (`allowOverwrite: true`, `addRandomSuffix: false`).
- Metadata is stored in Neon table `qpart_part_images` (one row per part) with blob URL/path, mime type, file size and timestamps.
- Required env: `BLOB_READ_WRITE_TOKEN` in Vercel/hosted environment.
- Planned next step: read metadata/blob path and render the current part image on detail page when present.
