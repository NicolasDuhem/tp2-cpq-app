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
- `/sales/bike-allocation` → sales allocation matrix with active/inactive toggles and replay launch to `/cpq`.
  - Supports route filters `country_code`, `ruleset`, and `bike_type` for deep-link drill-down from dashboard views.
  - Toggle/bulk mutations revalidate + refresh the route so UI status updates immediately from `CPQ_sampler_result.active`.

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
