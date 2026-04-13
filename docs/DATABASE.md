# DATABASE (retained CPQ model)

## Tables
1. `CPQ_setup_account_context`
   - Builder/setup account context definitions.
2. `CPQ_setup_ruleset`
   - Ruleset definitions used by runtime targeting.
3. `CPQ_sampler_result`
   - Persistent traversal snapshots and sync-processing flags.
   - Logical uniqueness is `(ipn_code, country_code)`.
   - `country_code` originates from selected setup account context (`CPQ_setup_account_context`).
4. `cpq_image_management`
   - Selection-to-picture-layer mappings.

## SQL baseline strategy
- Keep a clean fresh baseline only:
  - `sql/schema.sql`
  - `sql/seed.sql`
- No historical monolith migrations are retained in this extracted CPQ scope.

## Indexing / uniqueness notes
- `cpq_sampler_result_ipn_country_unique_idx` enforces DB-side uniqueness for non-null `(ipn_code, country_code)`.
- App/API also apply deduplication logic so first-discovered tuple is retained and later duplicates are skipped.
