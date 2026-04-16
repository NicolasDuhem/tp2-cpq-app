# STOCK_BIKE_IMG_EXPERIMENT

## Purpose
`Stock_bike_img_` remains an **isolated experimental** stock-bike image rule engine that runs in parallel to the stable CPQ picture-management process.

## Scope and isolation
- Dedicated page: `/cpq/stock-bike-img`
- Dedicated APIs: `/api/stock_bike_img_rules/*`
- Dedicated service: `lib/Stock_bike_img_service.ts`
- Dedicated SQL objects, all prefixed with `stock_bike_img_`
- Existing stable CPQ process (`/cpq`, `/cpq/setup`, `/api/cpq/*`) is not part of this experiment

## Admin-only access
- Navigation entry is admin-only.
- `/cpq/stock-bike-img` enforces admin mode and redirects non-admin users to `/cpq`.

## Selector loading flow (category-first)
The authoring flow is category-first and loads from Neon-backed tables in this sequence:

1. **Category selector**
   - Loaded from `stock_bike_img_digit_reference` grouped by `stock_bike_img_rule_category_name`.
2. **Rule family selector**
   - Loaded from `stock_bike_img_rule_family` + `stock_bike_img_rule_family_category`.
   - Frontend filters families by selected category using normalized matching (`trim + uppercase`) to avoid case/spacing mismatches across tables.
3. **Bike-type group selector**
   - Loaded from `stock_bike_img_family_bike_group` for selected family.
4. **Rules table**
   - Loaded from `stock_bike_img_rule` filtered by model year (selected year + `NULL`) and selected category.
5. **Reference metadata panel**
   - Loaded from `stock_bike_img_digit_reference` for selected category (digit positions, values, and meanings).

## Root-cause fix for empty selectors
The page previously depended on strict string equality between category values from different tables. In populated environments this could fail because of category text formatting inconsistencies (case/whitespace), which then produced empty dependent selectors (families/groups) and unusable authoring.

Fixes:
- Category filtering in service queries is normalized (`upper(trim(...))`) for rules and digit reference lookups.
- Family/category validation for create/update now uses normalized matching.
- Frontend family filtering also normalizes category values before matching.
- Frontend load now handles non-200 API responses explicitly and shows clear status.

## Condition authoring UX (guided builder)
Raw input like `1=S,M;2=2,3` is no longer the primary authoring path.

### Builder behavior
- “Build conditions” opens a modal.
- Modal groups options by digit position for the selected category.
- Each option shows:
  - digit value
  - business meaning (`stock_bike_img_value_meaning`)
- Multi-select is supported per digit position.
- Selections are converted to canonical internal signature text (`position=value1,value2;...`) and then saved as normalized condition JSON.

### Source of truth
The builder is driven exclusively by `stock_bike_img_digit_reference` for:
- available digit positions
- available values per position
- value meaning labels

If metadata is missing for a category, the modal shows an empty-state helper message instead of failing.

## Create, edit, and duplicate compatibility
- **Create**: starts with empty condition signature; builder fills it.
- **Edit**: existing stored condition JSON is converted back to signature text and preloaded in builder checkboxes.
- **Duplicate**: cloned draft keeps condition selections and opens editable copy (`(copy)` name suffix).

## Rule authoring model
A rule is authored against:
- category
- rule family
- bike-type group (optional; `NULL` means all groups in family)
- optional model year
- SKU digit conditions (JSON)
- picture outputs + layer order

Duplicate rule prevention signature includes:
- model year (with `NULL` normalized)
- category
- family
- bike-type group (with `NULL` normalized)
- normalized condition signature

## Runtime matching flow
Given a 30-char SKU:
1. Validate SKU length.
2. Resolve model year from char 20.
3. Resolve business bike type from char 17 mapping table.
4. Load active candidate rules filtered by:
   - model year = exact or `NULL`
   - bike-type group membership for resolved business bike type (or group `NULL`)
5. Evaluate condition JSON against SKU digits.
6. Return matched rules and layered picture links ordered by layer/category/id.

## Efficiency notes
- Runtime candidate filtering is done in SQL (year + group membership), reducing JS-side checks.
- Relevant indexes exist on rule runtime columns and bike-type digit mapping columns.

## SQL data model (experiment-only tables)
- Existing retained:
  - `stock_bike_img_digit_reference`
  - `stock_bike_img_rule` (extended)
- Added:
  - `stock_bike_img_business_bike_type`
  - `stock_bike_img_business_bike_type_digit_map`
  - `stock_bike_img_rule_family`
  - `stock_bike_img_rule_family_category`
  - `stock_bike_img_family_bike_group`
  - `stock_bike_img_family_bike_group_member`

## Removability
Experiment remains removable with localized changes:
1. Remove stock-bike page/API/service files.
2. Remove navigation link.
3. Drop `stock_bike_img_*` tables.
4. Remove experiment seed blocks and this doc.

No stable CPQ table or route is required by this module.
