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

## Key business concepts now supported

### 1) Model year (char 20) with optional rule scope
- SKU digit position 20 maps to model year:
  - `1`→2020, `2`→2021, ..., `9`→2028
- Rule column `stock_bike_img_model_year` is now nullable:
  - `NULL` = applies to all model years
  - specific year (e.g. 2025) = applies only to that year

### 2) Business bike type dictionary
Raw char 17 values are now normalized into a controlled dictionary (`stock_bike_img_business_bike_type`) via `stock_bike_img_business_bike_type_digit_map`.

This allows multiple raw SKU values to map to one business type (for example demos and editions collapsing into `C Line`).

### 3) Rule family / constraint family
`stock_bike_img_rule_family` defines grouping logic context.

Examples seeded:
- `MAIN_FRAME_FAMILY`
- `DIGIT_2_FAMILY`
- `DEFAULT_FAMILY`

A family can be mapped to categories through `stock_bike_img_rule_family_category`.

### 4) Family-specific bike-type groups
`stock_bike_img_family_bike_group` + `stock_bike_img_family_bike_group_member` define how business bike types are grouped **inside each family**.

This enables different grouping behavior for the same bike type depending on family.

## `stock_bike_img_digit_reference` usage
The preloaded `stock_bike_img_digit_reference` table is the authoring reference source for:
- category list
- digit positions per category
- allowed values
- value meanings

UI reads this table via API and displays guidance panel so users can author conditions with business wording.

## Rule authoring model
A rule is authored against:
- category
- rule family
- bike-type group (optional; `NULL` means all groups in family)
- optional model year
- SKU digit conditions (JSON)
- picture outputs + layer order

Duplicate rule prevention signature now includes:
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
   - model year = exact or NULL
   - bike-type group membership for resolved business bike type (or group NULL)
5. Evaluate condition JSON against SKU digits.
6. Return matched rules and layered picture links ordered by layer/category/id.

### Efficiency notes
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
