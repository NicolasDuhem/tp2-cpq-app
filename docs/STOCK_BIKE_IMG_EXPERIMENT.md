# STOCK_BIKE_IMG_EXPERIMENT (isolated module deep dive)

## 1) Purpose and isolation contract
`stock-bike-img` is an **admin-only experimental image-rule engine** intended to explore SKU-digit-based layered image matching without modifying the stable CPQ picture-management pipeline.

Isolation boundary is explicit by naming and placement:
- route: `/cpq/stock-bike-img`
- APIs: `/api/stock_bike_img_rules`, `/api/stock_bike_img_rules/[id]`, `/api/stock_bike_img_rules/test`
- service: `lib/Stock_bike_img_service.ts`
- UI: `components/stock_bike_img_/Stock_bike_img_ExperimentPage.tsx`
- DB: `stock_bike_img_*` tables only

No stable `/api/cpq/*` endpoint depends on these tables.

---

## 2) Access and architecture

### Access model
- Navigation tab is admin-only.
- Page enforces admin mode (`useAdminMode`): non-admin users are redirected to `/cpq`.

### Page behavior
The experiment page combines:
- filtered rule listing (model year + category),
- category/family/group-aware authoring form,
- guided condition builder from digit references,
- duplicate/edit/delete actions,
- runtime SKU test area to evaluate rule matching.

### API/service flow
- `GET /api/stock_bike_img_rules`: returns rules + reference categories + digit rows + families/groups.
- `POST /api/stock_bike_img_rules`: create rule with validation and duplicate protection.
- `PUT /api/stock_bike_img_rules/[id]`: update rule.
- `DELETE /api/stock_bike_img_rules/[id]`: delete rule.
- `POST /api/stock_bike_img_rules/test`: evaluate a 30-char SKU against active rules.

### 2026-04 backend fix: 500 root cause
- Root cause of `GET /api/stock_bike_img_rules` 500 was in service SQL, not Neon table content.
- `Stock_bike_img_list_rule_families` and `Stock_bike_img_validate_family_and_group` were joining family-category/group tables with stale FK names (`stock_bike_img_rule_family_id`), while live schema links by `stock_bike_img_family_key`.
- Because GET loads families in parallel with categories/rules/refs, that single SQL exception caused the entire route to fail.
- Route lacked a defensive `try/catch`, so failure surfaced as HTTP 500 with empty body in the browser.

### Updated GET response contract (success)
`GET /api/stock_bike_img_rules` now returns:
- `rows`
- `stock_bike_img_reference_categories`
- `stock_bike_img_reference_rows`
- `stock_bike_img_rule_families`
- `stock_bike_img_reference_debug` with:
  - `stock_bike_img_api_load_ok`
  - `stock_bike_img_trace_id`
  - `stock_bike_img_selected_category_raw`
  - `stock_bike_img_selected_category_key`
  - `stock_bike_img_reference_row_count`
  - `stock_bike_img_reference_category_count`
  - `stock_bike_img_family_count`
  - `stock_bike_img_group_count`
  - `stock_bike_img_available_category_keys`

### Updated error contract (stock-bike-img APIs)
On error, stock-bike-img API routes now return JSON (no empty body) with:
- `traceId`
- `error`
- `stage`
- `details`

This is implemented for:
- `GET/POST /api/stock_bike_img_rules`
- `PUT/DELETE /api/stock_bike_img_rules/[id]`
- `POST /api/stock_bike_img_rules/test`

---

## 3) Data model (experiment-only)

## Reference tables
- `stock_bike_img_digit_reference`:
  - defines valid digit positions, allowed values, and business meaning text by category.
- `stock_bike_img_business_bike_type`:
  - business bike-type master.
- `stock_bike_img_business_bike_type_digit_map`:
  - maps specific digit value (position currently resolved at 17 in runtime) to business bike type.

## Rule grouping tables
- `stock_bike_img_rule_family`:
  - high-level family partition.
- `stock_bike_img_rule_family_category`:
  - allowed category membership per family (linked by `stock_bike_img_family_key` + `stock_bike_img_rule_category_name`).
- `stock_bike_img_family_bike_group`:
  - optional bike-type groups under a family (linked by `stock_bike_img_family_key`; group identity uses `stock_bike_img_group_key` / `stock_bike_img_group_name`).
- `stock_bike_img_family_bike_group_member`:
  - membership table linking business bike types to groups.

## Rule table
- `stock_bike_img_rule`:
  - optional model year (`NULL` = all years),
  - category,
  - family,
  - optional bike-type group (`NULL` = all groups),
  - rule metadata,
  - conditions JSON + normalized signature,
  - layer order,
  - picture links 1..3,
  - active flag.

### Duplicate prevention
Unique index enforces signature uniqueness across:
- coalesced model year,
- category,
- family,
- coalesced group,
- conditions signature.

---

## 4) Rule logic and runtime matching

### Model year from digit 20
`Stock_bike_img_resolve_model_year_from_sku`:
- requires SKU length exactly 30.
- reads char index `19` (digit 20).
- maps digits `1..9` to MY `2020..2028`.

### When model year is optional
Rule row `stock_bike_img_model_year = NULL` applies across all model years.
Matching SQL includes either exact year or null-year fallback.

### Business bike type concept
`Stock_bike_img_resolve_business_bike_type` reads char index `16` (digit 17) and resolves through `stock_bike_img_business_bike_type_digit_map` (position 17).

### Family/group logic
Candidate rules are filtered by:
- active flag,
- year match (exact or null),
- group membership condition:
  - if rule group is null => applicable to all groups in family,
  - else business bike type must belong to that group.

### Digit reference usage
Authoring-side condition builder is metadata-driven from `stock_bike_img_digit_reference` by selected category key.

### Selector data provenance
- Category dropdown: `stock_bike_img_reference_categories` derived from `stock_bike_img_digit_reference`.
- Condition builder options: `stock_bike_img_reference_rows` from `stock_bike_img_digit_reference` filtered by selected category.
- Family dropdown: `stock_bike_img_rule_families` from `stock_bike_img_rule_family` + `stock_bike_img_rule_family_category` (`stock_bike_img_family_key` link).
- Bike-type group dropdown: nested `stock_bike_img_groups` from `stock_bike_img_family_bike_group` joined via `stock_bike_img_family_key`.

### Category behavior
Category keys are normalized (`trim + whitespace collapse + uppercase`) to reduce drift between tables and UI state.

### Runtime condition matching
After SQL candidate pre-filtering, each rule validates all conditions:
- for each condition position, SKU digit must be in `allowedValues`.
- only fully matched rules are returned.

### Layer output behavior
Matched rules are flattened into layered images using picture links 1..3 with per-rule layer order.

---

## 5) Current authoring flow

1. Select model-year filter (for list display).
2. Select category (normalized key internally, human label shown).
3. Choose rule family (limited to families mapped to category).
4. Optionally choose bike-type group (or all groups).
5. Set model-year scope (specific year or all years).
6. Build condition signature via modal:
   - grouped by digit position,
   - checkbox values with meaning labels.
7. Fill rule metadata and picture links.
8. Save create/update.

Other actions:
- duplicate existing rule (loads editable copy with `(copy)` suffix),
- delete rule,
- test runtime with a SKU string.

Known guardrails in code:
- condition positions limited to 1..30,
- unique positions in a condition set,
- non-empty allowed values,
- layer order 1..999,
- family/category/group consistency validated server-side.

---

## 6) Current limitations / gaps
- Admin mode is UI/session based (not hardened server auth).
- Model year mapping is hardcoded to 2020..2028 digit map.
- Runtime test route is manual and page-centric; no integration into stable Bike Builder preview pipeline.
- Output supports 3 picture links per rule (stable picture-management supports 4 links per option row).
- Experiment diagnostics are intentionally verbose and page-local for temporary debugging.

---

## 7) Removal strategy (surgical)
If removing the experiment entirely, delete in this order:

1. **Navigation/UI route wiring**
   - remove admin tab link in `components/shared/app-navigation.tsx`.
   - remove page file `app/cpq/stock-bike-img/page.tsx`.
   - remove component `components/stock_bike_img_/Stock_bike_img_ExperimentPage.tsx`.

2. **API surface**
   - delete `app/api/stock_bike_img_rules/route.ts`.
   - delete `app/api/stock_bike_img_rules/[id]/route.ts`.
   - delete `app/api/stock_bike_img_rules/test/route.ts`.

3. **Service layer**
   - delete `lib/Stock_bike_img_service.ts`.

4. **Database**
   - drop all `stock_bike_img_*` tables and related indexes/constraints.

5. **Docs cleanup**
   - remove this file and references in docs index/audit docs.

Stable `/cpq`, `/cpq/setup`, `/cpq/results`, `/api/cpq/*` behavior remains intact because it does not call experiment services.

---

## 8) Possible future integration path (instead of deletion)
If integrating experiment concepts into stable picture-management later, likely touchpoints are:

1. **Data model convergence**
   - decide whether to enrich `cpq_image_management` with rule predicates or map experiment outputs into it.

2. **Runtime resolver integration**
   - augment `/api/cpq/image-layers` to optionally evaluate SKU/rule logic before/alongside exact option tuple lookup.

3. **Authoring UX merge**
   - bring condition-builder patterns into `/cpq/setup` picture management if business users need digit-based rule authoring.

4. **Identity consistency**
   - standardize layer-slot support (experiment currently 3 links vs stable 4 links) and layer ordering semantics.

5. **Operational controls**
   - align with existing feature-level controls (`ignore_during_configure`, `feature_layer_order`) to avoid dual governance models.

Integration should be done as an explicit migration project; do not partially cross-wire routes/tables without a deliberate schema and UX contract.
