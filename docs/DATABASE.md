# DATABASE

## Core tables
1. `CPQ_setup_account_context`
   - Account/customer context used to build StartConfiguration integration parameters.
2. `CPQ_setup_ruleset`
   - Ruleset + namespace + header defaults for StartConfiguration.
3. `cpq_configuration_references` (**canonical manual save/retrieve table**)
   - Stores finalized configuration identities and full retrieval context.
4. `CPQ_sampler_result`
   - Historical sampler output table (not canonical manual save/retrieve).
5. `cpq_image_management`
   - Option-to-image layer mapping.

## `cpq_configuration_references` fields
- identity: `configuration_reference` (unique), `ruleset`, `namespace`, `header_id`, `finalized_detail_id`
- retrieve metadata: `source_header_id`, `source_detail_id`
- account context: `account_code`, `customer_id`, `account_type`, `company`, `currency`, `language`, `country_code`, `customer_location`
- application context: `application_instance`, `application_name`
- session/finalization metadata: `finalized_session_id`, `final_ipn_code`, `product_description`
- snapshots: `finalize_response_json`, `json_snapshot`
- lifecycle: `is_active`, `created_at`, `updated_at`

## Save/retrieve semantics
- Save writes finalized rows to `cpq_configuration_references` after FinalizeConfiguration.
- Retrieve resolves a row by `configuration_reference` and rebuilds StartConfiguration from saved data.
- `CPQ_sampler_result` is intentionally excluded from canonical save/retrieve behavior.
