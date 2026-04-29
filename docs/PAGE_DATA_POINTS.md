# PAGE_DATA_POINTS

Implementation-grounded page contract inventory for UI data points and source/target behavior.

## Method
- Read all route pages under `app/**/page.tsx`.
- Traced to page components in `components/**`.
- Traced read/write behavior through APIs in `app/api/**` and services in `lib/**`.
- Cross-checked against SQL baseline/migrations in `sql/**`.
- Marked inferred mappings when direct schema evidence is partial.

## Admin Data Point page source
The in-app internal viewer is at:
- route: `/admin/data-point`
- nav label: `Admin - Data point` (admin mode only)
- registry: `lib/admin/data-point-registry.ts`
- renderer: `components/admin/data-point-page.tsx`

## Coverage in this pass
- `/dashboard`
- `/cpq`
- `/cpq/setup`
- `/cpq/results`
- `/cpq/process`
- `/cpq/ui-docs`
- `/sales/bike-allocation`
- `/sales/qpart-allocation`
- `/qpart`
- `/qpart/parts`, `/qpart/parts/new`, `/qpart/parts/[id]`
- `/qpart/hierarchy`
- `/qpart/metadata`
- `/qpart/compatibility`
- `/qpart/admin/sequences`

## High-confidence source-of-truth summary
- Canonical CPQ save/retrieve: `cpq_configuration_references`.
- CPQ sampler/support + bike sales status source: `CPQ_sampler_result`.
- CPQ setup masters: `CPQ_setup_account_context`, `CPQ_setup_ruleset`, `cpq_country_mappings`.
- Image layering + ignore/order flags: `cpq_image_management`.
- QPart core: `qpart_parts`, `qpart_part_translations`, `qpart_metadata_definitions`, `qpart_part_metadata_values`, `qpart_part_compatibility`, `qpart_country_allocation`.

## Known inferential zones (awaiting Neon dump)
- Exact production column supersets for canonical lineage columns beyond baseline schema.
- Potential production-only indexes/constraints not represented in baseline migrations.
- Historical data shape variants in `CPQ_sampler_result.json_result` across old runs.

