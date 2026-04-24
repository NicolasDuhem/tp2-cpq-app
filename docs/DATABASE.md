# Database documentation (code-backed)

This document reflects what current code reads/writes and what `sql/schema.sql` + migrations define.

## Tables currently used by runtime code
1. `CPQ_setup_account_context`
2. `CPQ_setup_ruleset`
3. `CPQ_sampler_result`
4. `cpq_configuration_references`
5. `cpq_image_management`
6. `cpq_country_mappings`

## Canonical vs supporting data

### Canonical saved configuration
- Table: `cpq_configuration_references`
- Used by:
  - `POST/GET /api/cpq/configuration-references`
  - `POST /api/cpq/retrieve-configuration`
- Canonical retrieve identity: `configuration_reference` + `is_active=true`

### Supporting operational snapshots
- Table: `CPQ_sampler_result`
- Used by:
  - manual/auto sampler writes (`/api/cpq/sampler-result`)
  - picture sync source (`/api/cpq/setup/picture-management/sync`)
  - results matrix read model (`/cpq/results`)
  - sales allocation read/write (`/sales/bike-allocation` + sales APIs)
- Allocation status source: `CPQ_sampler_result.active` (not JSON field)

### Setup/master tables
- `CPQ_setup_account_context`: account/customer/currency/language + region/sub-region/country setup
- `CPQ_setup_ruleset`: ruleset metadata + bike_type + namespace/header defaults
- `cpq_country_mappings`: region/sub-region/country master mapping used by setup dropdowns

### Image/layer mapping table
- `cpq_image_management`
- Stores feature/option/value rows + `picture_link_1..4`, `is_active`, `ignore_during_configure`, `feature_layer_order`

## Key write paths
- `/cpq` save writes `cpq_configuration_references`, then writes `CPQ_sampler_result`.
- Setup page writes:
  - account contexts (`CPQ_setup_account_context`)
  - country mappings (`cpq_country_mappings`)
  - rulesets (`CPQ_setup_ruleset`)
  - picture rows and feature-wide settings (`cpq_image_management`)
- Picture sync writes:
  - marks sampler rows processed in `CPQ_sampler_result`
  - inserts missing combinations into `cpq_image_management`
- Sales allocation writes:
  - toggles or bulk-updates `CPQ_sampler_result.active`

## Constraints/behaviors that matter in code
- `CPQ_setup_account_context.country_code` must match ISO2 uppercase format.
- `CPQ_setup_account_context` enforces non-blank `account_code`.
- `CPQ_setup_account_context` enforces unique `(country_code, currency)` combinations.
- `CPQ_setup_account_context(region, sub_region, country_code)` references `cpq_country_mappings`.
- `cpq_country_mappings` enforces unique `(region, sub_region, country_code)` rows.
- `cpq_image_management` has unique `(feature_label, option_label, option_value)`.
- `cpq_image_management.feature_layer_order` constrained to `1..20`.
- `CPQ_sampler_result.active` is `NOT NULL DEFAULT true`.
- `cpq_configuration_references.configuration_reference` is unique.

## Notable schema nuance
`saveConfigurationReference()` writes fields including `canonical_header_id`, `canonical_detail_id`, and `source_working_detail_id`.
Ensure deployed DB schema includes all columns expected by current runtime code when provisioning new environments.
