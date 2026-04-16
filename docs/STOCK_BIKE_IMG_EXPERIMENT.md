# STOCK_BIKE_IMG_EXPERIMENT

## Purpose
`Stock_bike_img_` is an isolated experimental stock-bike image logic path that runs **in parallel** to the existing CPQ picture-management process.

## Scope
- Dedicated page: `/cpq/stock-bike-img`
- Dedicated API namespace: `/api/stock_bike_img_rules/*`
- Dedicated DB table: `stock_bike_img_rule`
- Dedicated service module: `lib/Stock_bike_img_service.ts`

No existing picture-management behavior is required by this module.

## Data model
Single-table design for removability and minimal footprint:

- `stock_bike_img_rule`
  - model year
  - rule category/name/description
  - JSON conditions array (`position` + `allowedValues[]`)
  - up to 3 picture links
  - active flag
  - layer order
  - normalized `stock_bike_img_conditions_signature` for duplicate prevention

## Model year logic (digit position 20)
From the 30-character SKU code, char index 19 (digit position 20) maps to model year:
- `1`→2020, `2`→2021, `3`→2022, `4`→2023, `5`→2024, `6`→2025, `7`→2026, `8`→2027, `9`→2028

## Rule logic
A rule is matched when **all** rule conditions match SKU digits.

Condition format:
- `position`: integer 1..30
- `allowedValues`: uppercase normalized list

Example serialized condition text in UI:
- `1=S;4=B;17=B,C,D`

## Duplicate prevention
Duplicate is defined as:
- same `stock_bike_img_model_year`
- same `stock_bike_img_rule_category`
- same normalized condition signature (`stock_bike_img_conditions_signature`)

Implemented at:
1. app-side normalization + signature generation
2. DB unique constraint (`stock_bike_img_rule_unique_signature`)

## Runtime matching flow
1. Validate SKU length = 30
2. Read digit position 20, resolve model year
3. Load active rules for that model year (indexed query)
4. Evaluate each rule against SKU digits
5. Collect matched rules
6. Collect up to 3 picture links per matched rule
7. Return layered images in stable order (`layer_order`, category, id, slot)

## Where code lives
- `lib/Stock_bike_img_service.ts`
- `app/api/stock_bike_img_rules/route.ts`
- `app/api/stock_bike_img_rules/[id]/route.ts`
- `app/api/stock_bike_img_rules/test/route.ts`
- `app/cpq/stock-bike-img/page.tsx`
- `components/stock_bike_img_/Stock_bike_img_ExperimentPage.tsx`

## Removal plan
To fully remove this experiment:
1. Remove route/page/component files listed above.
2. Remove `Stock_bike_img_` link from `components/shared/app-navigation.tsx`.
3. Drop table `stock_bike_img_rule` and related indexes.
4. Remove this doc file.

Because this experiment uses one table + dedicated route/module namespace, removal is low-risk and localized.
