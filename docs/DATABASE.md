# Database (authoritative: live Neon CSV export)

This document treats the Neon CSV exports as source of truth:

- `table.csv`
- `columns.csv`
- `fieldrequired.csv`
- `constraints.csv`
- `indexes.csv`

`sql/schema.sql` is documented as a local baseline and may lag production/live schema.

## 1) Live table inventory (from `table.csv`)

1. `cpq_configuration_references`
2. `cpq_image_management`
3. `cpq_sampler_result`
4. `cpq_setup_account_context`
5. `cpq_setup_ruleset`

## 2) Canonical vs secondary table roles

### Canonical
- `cpq_configuration_references`
  - Canonical manual save/retrieve registry.
  - Source for reference resolution and retrieve startup context.

### Secondary/support
- `cpq_sampler_result`
  - Manual/support snapshots used for historical matrixing and image-management seeding.
  - Not canonical retrieve source.
- `cpq_image_management`
  - Mapping table for layered product preview and feature-level bulk ignore flags.
- `cpq_setup_account_context`
  - Setup master data for CPQ account/customer/currency/language/country context.
- `cpq_setup_ruleset`
  - Setup master data for available CPQ rulesets and metadata.

## 3) Live column counts (from `columns.csv`)

- `cpq_configuration_references`: 30 columns
- `cpq_image_management`: 12 columns
- `cpq_sampler_result`: 16 columns
- `cpq_setup_account_context`: 9 columns
- `cpq_setup_ruleset`: 10 columns

## 4) Live insert requirements (from `fieldrequired.csv`)

### `cpq_configuration_references`
- Required-on-insert: `configuration_reference`, `canonical_detail_id`, `ruleset`, `namespace`
- Auto/defaulted: `id`, `canonical_header_id`, `json_snapshot`, `is_active`, `created_at`, `updated_at`, `finalize_response_json`

### `cpq_image_management`
- Required-on-insert: `feature_label`, `option_label`, `option_value`
- Auto/defaulted: `id`, `is_active`, `created_at`, `updated_at`, `ignore_during_configure`

### `cpq_sampler_result`
- Required-on-insert: `ruleset`, `account_code`
- Auto/defaulted: `id`, `json_result`, `processed_for_image_sync`, `created_at`

### `cpq_setup_account_context`
- Required-on-insert: `account_code`, `customer_id`, `currency`, `language`, `country_code`
- Auto/defaulted: `id`, `is_active`, `created_at`, `updated_at`

### `cpq_setup_ruleset`
- Required-on-insert: `cpq_ruleset`
- Auto/defaulted: `id`, `namespace`, `header_id`, `is_active`, `sort_order`, `created_at`, `updated_at`

## 5) Live constraints and index highlights

## Key constraints
- `cpq_configuration_references.configuration_reference` unique.
- `cpq_setup_account_context.account_code` unique.
- `cpq_setup_ruleset.cpq_ruleset` unique.
- `cpq_image_management` unique composite key on `(feature_label, option_label, option_value)`.
- `cpq_setup_account_context.country_code` check constraint enforcing two-letter uppercase code.

## Key indexes
- `cpq_configuration_references`
  - lookup index `(configuration_reference, is_active)`
  - account/ruleset helper indexes
- `cpq_sampler_result`
  - filter index `(ruleset, account_code, country_code)`
  - IPN+created index
  - unprocessed partial index for sync queue
- `cpq_image_management`
  - lookup index on feature/option/value (active rows)

## 6) Live schema vs `sql/schema.sql` mismatches

The live CSV schema and local baseline SQL are not fully aligned.

### Missing in `sql/schema.sql` but present in live schema (`cpq_configuration_references`)
- `canonical_header_id`
- `canonical_detail_id`
- `source_working_detail_id`
- `source_session_id`

These columns are actively used by runtime save/retrieve code; a DB created from the SQL baseline alone can break canonical save/retrieve.

### Insert requirement mismatch (not-null drift)
- Live `fieldrequired.csv` indicates `configuration_reference` is required on insert.
- Runtime code can auto-generate `configuration_reference` if omitted.
- Practical outcome: API still works because generation happens before insert, but docs and expectations must treat DB column as required at DB boundary.

## 7) Practical governance for DB docs

When DB behavior changes:
1. Update live Neon schema.
2. Re-export CSVs.
3. Reconcile `sql/schema.sql` and docs in the same change.
4. Re-validate runtime assumptions in:
   - `lib/cpq/runtime/configuration-references.ts`
   - `lib/cpq/runtime/persistence.ts`
   - `lib/cpq/setup/service.ts`
