# QPart — Spare Parts PIM (Implementation-Ready Plan)

## 1) Scope and architectural isolation (non-breaking CPQ)

QPart will be implemented as a **separate domain module** under `/qpart` with dedicated pages, API handlers, services, types, and DB tables.

Isolation principles:
- QPart routes only under `app/qpart/*`.
- QPart APIs only under `app/api/qpart/*`.
- QPart service/data access only under `lib/qpart/*` and `types/qpart.ts`.
- QPart database objects use `qpart_` prefix.
- No CPQ runtime page (`/cpq`) dependency on QPart tables/services.
- Integration with CPQ setup/sampler tables is **read-only** for locale and compatibility option derivation.

This supports removability: deleting `qpart_*` tables and `/qpart` code should not break CPQ runtime or setup behavior.

---

## 2) Proposed route/page structure

Primary pages (App Router):
- `/qpart` — dashboard / feature landing page.
- `/qpart/parts` — part list with search and hierarchy drill-down filters.
- `/qpart/parts/new` — create part workflow.
- `/qpart/parts/[id]` — edit part with tabbed sections.
- `/qpart/hierarchy` — hierarchy node management (levels 1..7).
- `/qpart/metadata` — metadata definition management.
- `/qpart/compatibility` — compatibility reference catalog + derivation preview.

Supporting API routes:
- `GET /api/qpart/locales` (distinct languages from `CPQ_setup_account_context`).
- `GET /api/qpart/bike-types` (distinct bike types from `CPQ_setup_ruleset`).
- CRUD under `/api/qpart/parts`, `/api/qpart/hierarchy`, `/api/qpart/metadata`, `/api/qpart/compatibility`.
- `POST /api/qpart/translations/field` for field-by-field AI translation of English core fields (title/description) and translatable metadata values (server-side OpenAI integration, fill-missing default).
- `POST /api/qpart/compatibility/derive` for bike-type-driven feature/option discovery from `CPQ_sampler_result.json_result`.

---

## 3) Proposed database schema / migration plan

> Design choice: normalized metadata-value model (no per-field ALTER TABLE).

### 3.1 Core part model

1. `qpart_parts`
- `id bigserial pk`
- `part_number text not null unique`
- `status text not null default 'active'` (`active|inactive|draft` check)
- `default_name text not null` (English/base)
- `default_description text null` (English/base)
- `hierarchy_node_id bigint null references qpart_hierarchy_nodes(id)`
- audit fields (`created_at`, `updated_at`, `created_by`, `updated_by`)

2. `qpart_hierarchy_nodes`
- `id bigserial pk`
- `level smallint not null check (level between 1 and 7)`
- `code text not null`
- `label_en text not null`
- `parent_id bigint null references qpart_hierarchy_nodes(id)`
- `is_active boolean not null default true`
- unique constraints:
  - `(level, code)`
  - `(parent_id, code)` (optional if code may repeat across branches)
- trigger/check logic to enforce `parent.level = child.level - 1`.

3. `qpart_part_hierarchy_assignments` (optional future if multi-node assignment needed)
- Not in MVP if one primary hierarchy assignment is enough.

### 3.2 Flexible metadata model

4. `qpart_metadata_definitions`
- `id bigserial pk`
- `key text not null unique` (e.g., `ean13`, `material`)
- `label_en text not null`
- `field_type text not null` (`text|long_text|number|boolean|date|single_select|multi_select`)
- `is_translatable boolean not null default false`
- `is_required boolean not null default false`
- `is_active boolean not null default true`
- `display_order integer not null default 100`
- `validation_json jsonb not null default '{}'::jsonb` (regex/min/max etc.)
- `options_json jsonb not null default '[]'::jsonb` (for select types)

5. `qpart_part_metadata_values`
- `id bigserial pk`
- `part_id bigint not null references qpart_parts(id) on delete cascade`
- `metadata_definition_id bigint not null references qpart_metadata_definitions(id)`
- `locale text not null default 'en-GB'`
- `value_text text null`
- `value_number numeric null`
- `value_boolean boolean null`
- `value_date date null`
- `value_json jsonb null` (multi-select payload, structured value)
- unique `(part_id, metadata_definition_id, locale)`
- check/validation in service layer based on field type/translatable flag.

> For English-only fields, only one row with base locale is stored.

### 3.3 Translations

6. `qpart_part_translations`
- `id bigserial pk`
- `part_id bigint not null references qpart_parts(id) on delete cascade`
- `locale text not null`
- `name text null`
- `description text null`
- unique `(part_id, locale)`

### 3.4 Compatibility model

7. `qpart_part_bike_type_compatibility`
- `id bigserial pk`
- `part_id bigint not null references qpart_parts(id) on delete cascade`
- `bike_type text not null`
- unique `(part_id, bike_type)`

8. `qpart_part_compatibility_rules`
- `id bigserial pk`
- `part_id bigint not null references qpart_parts(id) on delete cascade`
- `bike_type text not null`
- `feature_label text not null`
- `option_value text not null`
- `option_label text null`
- `source text not null default 'derived'` (`derived|reference|manual`)
- `is_active boolean not null default true`
- unique `(part_id, bike_type, feature_label, option_value)`

9. `qpart_compatibility_reference_values`
- `id bigserial pk`
- `bike_type text not null`
- `feature_label text not null`
- `option_value text not null`
- `option_label text null`
- `is_active boolean not null default true`
- unique `(bike_type, feature_label, option_value)`

### 3.5 Locale reference helper

10. optional view: `qpart_supported_locales_v`
- `select distinct language from CPQ_setup_account_context where language is not null and btrim(language) <> ''`

### 3.6 Migration sequencing

- **Migration A (foundation)**: create all `qpart_*` tables + constraints + indexes.
- **Migration B (seed)**: insert initial metadata definitions (`ean13`, `description`, `material`, etc.) with validation JSON.
- **Migration C (optional view/helpers)**: locale view + utility SQL functions for hierarchy integrity.

---

## 4) Service/data-access design

Create domain services:
- `lib/qpart/locales/service.ts`:
  - list supported locales from `CPQ_setup_account_context.language`.
  - determine base locale (prefer `en-GB`, fallback first `en-*`, else first distinct locale).
- `lib/qpart/hierarchy/service.ts`: CRUD + cascade query helpers.
- `lib/qpart/metadata/service.ts`: definitions CRUD + validation builder.
- `lib/qpart/parts/service.ts`: part CRUD, metadata persistence, translation upsert, list filtering.
- `lib/qpart/compatibility/service.ts`:
  - bike types from `CPQ_setup_ruleset`.
  - ruleset lookup by bike type.
  - sampler JSON extraction of `selectedOptions[].featureLabel/optionValue/optionLabel` with `dropdownOrderSnapshot` fallback.
  - merge with `qpart_compatibility_reference_values`.

All parsing/derivation must live in QPart service layer (not in CPQ runtime services).

---

## 5) UX design (MVP)

### `/qpart/parts`
- Search: part number, default name.
- Hierarchy filters: Level 1..7 cascading dropdowns.
- Status filter and bike-type filter (optional for MVP).
- Table columns: part number, name, hierarchy path, status, updated_at.

### `/qpart/parts/new` and `/qpart/parts/[id]`
Compact sectioned layout:
1. Core info (includes inline translation controls for English title/description and compact boolean metadata checkboxes)
2. Hierarchy
3. Metadata (collapsible, translatable fields have inline locale expansion + translate action)
4. Compatibility (collapsible)
5. Audit/status (future)

Behavior:
- English/base values required on create.
- Metadata controls rendered from active definitions by display order.
- For translatable metadata: base locale field + compact translation status, inline locale expansion, and per-field translate action from dynamic locale list.
- For English-only metadata: single base field.
- Standalone translations block is removed in favor of field-level translation UX where values are edited.
- Compatibility section: bike type multi-select, then derived feature/option pickers.

### `/qpart/hierarchy`
- Tree/grid manager with level indicator and parent selector.
- Enforce valid parent-level relation.

### `/qpart/metadata`
- Definition table + create/edit drawer.
- Type-aware config fields (options_json for select types, validation_json for regex/min/max).

### `/qpart/compatibility`
- Manage reference feature/option values by bike type.
- “Derive preview” utility to inspect options detected from sampler data.

---

## 6) Dynamic derivation logic for compatibility options

Given selected bike types:
1. Resolve matching rulesets from `CPQ_setup_ruleset` by `bike_type`.
2. Fetch `CPQ_sampler_result` rows where `ruleset IN (...)` (and optionally only recent rows / row limit).
3. Parse `json_result`:
   - primary: `selectedOptions[]` entries.
   - fallback: `dropdownOrderSnapshot` if selected options absent.
4. Extract normalized tuples: `(bike_type, feature_label, option_value, option_label)`.
5. Union with active `qpart_compatibility_reference_values` for those bike types.
6. Return distinct sorted option catalog for UI.

Performance controls:
- add query limits and date windows for derivation endpoint.
- cache derived catalog per bike type temporarily (optional phase 2).

---

## 7) Epics, user stories, and acceptance criteria

## EPIC 1 — QPart foundation and modular isolation

### Story 1.1
As a platform owner, I want QPart isolated so CPQ remains unaffected.

Acceptance criteria:
- Routes under `/qpart` only.
- Separate `qpart_*` tables only.
- Existing CPQ routes/components unaffected.
- Nav entry clearly separate.
- QPart can be removed with limited blast radius.

### Story 1.2
As a developer, I want separate services/APIs for QPart.

Acceptance criteria:
- QPart service layer under `lib/qpart/*`.
- QPart APIs under `/api/qpart/*`.
- No CPQ runtime state dependency.

## EPIC 2 — Supported locales and translation framework

### Story 2.1
As an admin, locales come from account context languages.

Acceptance criteria:
- Distinct locales loaded from `CPQ_setup_account_context.language`.
- Locale list dynamic.
- English/base indicated clearly.

### Story 2.2
As an admin, field translatability is definable.

Acceptance criteria:
- Metadata definition has translatable flag.
- English-only fields require only base value.
- Translatable fields expose per-locale values.
- Missing translations visually flagged.

### Story 2.3
As a maintainer, translation editing is clear.

Acceptance criteria:
- All supported locales shown.
- Base value prominent.
- Non-English values editable and persisted.

## EPIC 3 — Hierarchy management 1..7

### Story 3.1
Manage hierarchy 1..7 with parent-child.

Acceptance criteria:
- Exactly seven supported levels.
- CRUD in dedicated hierarchy model/page.
- Active/inactive control present.

### Story 3.2
Use one coherent hierarchy structure.

Acceptance criteria:
- One normalized table.
- Explicit level and parent linkage.
- Invalid parent/child levels blocked.

### Story 3.3
Enable cascading hierarchy filters.

Acceptance criteria:
- Level 1 selection scopes Level 2 options, etc.
- Responsive filtering in parts list.

## EPIC 4 — Spare part master record management

### Story 4.1
Create/edit part records.

Acceptance criteria:
- Create/edit screens available.
- Stable part identity.
- Hierarchy, metadata, compatibility sections present.

### Story 4.2
Search/filter/browse parts.

Acceptance criteria:
- Search on key fields.
- Hierarchy filters available.
- Practical metadata filters (phase-gated) available.

## EPIC 5 — Dynamic metadata definitions

### Story 5.1
Define metadata fields in UI.

Acceptance criteria:
- Metadata page exists.
- Add/edit definitions with required attributes.
- Definitions appear on part edit forms.

### Story 5.2
Seed standard fields but allow growth.

Acceptance criteria:
- Initial seed set present.
- New fields addable via UI.
- Translation behavior follows field definition.

### Story 5.3
Field types and validations enforced.

Acceptance criteria:
- Types: text, long_text, number, boolean, date, single_select, multi_select.
- Validation rules executed in service layer + UI hints.
- EAN13 can be validated via regex rule.

## EPIC 6 — Compatibility by bike type

### Story 6.1
Assign parts to bike types.

Acceptance criteria:
- Multi-select bike type assignment.
- Values sourced dynamically from `CPQ_setup_ruleset.bike_type`.

### Story 6.2
Derive compatibility options from selected bike types.

Acceptance criteria:
- Bike type -> rulesets resolution.
- Sampler rows filtered by those rulesets.
- Distinct feature/option values surfaced for maintenance.

## EPIC 7 — Dynamic compatibility derivation

### Story 7.1
System derives options from sampler JSON.

Acceptance criteria:
- Parse `selectedOptions` and fallback snapshot.
- Extract distinct feature/option tuples.

### Story 7.2
Store compatibility conditions cleanly.

Acceptance criteria:
- Dedicated `qpart_part_compatibility_rules` table.
- Rule records linked to part and bike type.

### Story 7.3
Maintain reusable reference values.

Acceptance criteria:
- Dedicated reference table exists.
- UI management available.
- Reference values merged into selectors.

## EPIC 8 — QPart UX usability

### Story 8.1
Clean and efficient UI.

Acceptance criteria:
- Reuses shared shell style.
- Clear navigation and compact layouts.
- Translation and compatibility UX understandable.

### Story 8.2
Logical part edit sections.

Acceptance criteria:
- Clear tabs/sections.
- Validation errors surfaced per section.
- Save actions predictable.

## EPIC 9 — Removability and non-breaking integration

### Story 9.1
QPart removable without CPQ breakage.

Acceptance criteria:
- CPQ has no runtime dependency on QPart.
- Disabling `/qpart` does not break `/cpq` routes.

## EPIC 10 — Documentation

### Story 10.1
Docs updated for maintainability.

Acceptance criteria:
- `docs/ARCHITECTURE.md` updated with QPart domain boundary.
- `docs/PROCESSDATA.md` updated with QPart flows.
- `docs/DATABASE.md` updated with qpart tables + derivation logic.

---

## 8) Implementation phases

### Phase 1 (MVP foundation)
- QPart route group + nav entry.
- Migrations for qpart tables.
- Locale discovery endpoint/service.
- Hierarchy page + API.
- Metadata definition page + API.
- Part list/create/edit with metadata + translations.

### Phase 2 (compatibility depth)
- Bike type assignment UI/API.
- Derivation endpoint from sampler JSON.
- Compatibility rules editor.
- Compatibility reference values page.
- Enhanced list filters.

### Phase 3 (operations)
- Import/export.
- Audit history and change log.
- dashboard/reporting and RBAC hardening.

---

## 9) Risks and design decisions

1. **Locale quality risk**: language entries may contain inconsistent formats.
   - Mitigation: normalize + validate locale format, still display raw if needed.

2. **Sampler JSON variability risk**: payload shape can vary.
   - Mitigation: robust parser with guards + fallback extraction path + telemetry.

3. **Derivation performance risk** on large sampler volumes.
   - Mitigation: index/filter ruleset, recency window, limit rows, optional pre-aggregation.

4. **Hierarchy integrity risk** with manual edits.
   - Mitigation: DB-level parent-level checks and service validation.

5. **Metadata misuse risk** (too many fields, poor quality).
   - Mitigation: active/required flags, type validation, display order, governance by admin users.

---

## 10) Decision: flexible metadata model vs adding physical columns on-the-fly

Recommendation: **Use metadata-definition + metadata-values (+ translation rows) model. Do not ALTER TABLE per new field.**

Why this is the best fit:
- Preserves removability and domain isolation.
- Avoids frequent schema migrations and deployment coupling.
- Supports mixed field types and translatability per field.
- Easier to govern with active/required/ordering and validation metadata.
- More maintainable when the business adds fields frequently.

Adding columns dynamically from UI is not recommended because it:
- increases migration and locking risk,
- complicates rollback,
- tightly couples UI actions to physical schema evolution,
- makes cross-environment consistency harder.

If a small subset becomes highly query-critical later, materialized/projection columns can be added deliberately as optimization, while canonical storage remains normalized.

---

## 11) Definition of done for implementation pass

- All MVP phase-1 routes and APIs functional under `/qpart`.
- qpart migrations applied cleanly.
- Locales and bike types loaded dynamically from CPQ setup tables.
- Hierarchy, metadata definitions, part CRUD, translations working.
- Compatibility scaffolding prepared for phase 2 derivation.
- Docs updated (`ARCHITECTURE`, `PROCESSDATA`, `DATABASE`, `PAGES_AND_COMPONENTS`).
- CPQ runtime smoke check confirms no regression.

---

## 12) Implementation status update (2026-04-24)
Implemented MVP in current repo with isolated namespaces:
- Pages: `/qpart`, `/qpart/parts`, `/qpart/parts/new`, `/qpart/parts/[id]`, `/qpart/hierarchy`, `/qpart/metadata`, `/qpart/compatibility`.
- APIs: `/api/qpart/locales`, `/api/qpart/bike-types`, CRUD for parts/hierarchy/metadata/reference values, and `/api/qpart/compatibility/derive`.
- DB: `qpart_*` table suite + hierarchy parent-level trigger + initial metadata seeds.

Minor implementation choices versus plan:
- Part edit uses single-page sections instead of tabbed UI, but includes all required MVP sections.
- Compatibility reference values are managed on dedicated `/qpart/compatibility` page and reused by derive endpoint union logic.


## Implemented extension: field-level AI translation
- Metadata UI keeps base locale input visible and hides non-base locale inputs behind an expand/collapse control.
- Each translatable field has per-field Translate action + compact status (`translated/target`).
- Locale targets remain dynamic from `CPQ_setup_account_context.language`; no hardcoded locale list.
- Translation persistence reuses `qpart_part_metadata_values`; no new translation tables were required.
- Safety policy is fill-missing-only by default (non-empty locale values are not overwritten).
- Server configuration: `OPENAI_API_KEY` (required), optional `OPENAI_TRANSLATION_MODEL` with default `gpt-5.4-mini`.
