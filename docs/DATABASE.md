# DATABASE (retained CPQ model)

## Tables
1. `CPQ_setup_account_context`
   - Builder/setup account context definitions.
2. `CPQ_setup_ruleset`
   - Ruleset definitions used by runtime targeting.
3. `CPQ_sampler_result`
   - Persistent sampler snapshots and sync-processing flags.
4. `cpq_image_management`
   - Selection-to-picture-layer mappings.

## SQL baseline strategy
- Keep a clean fresh baseline only:
  - `sql/schema.sql`
  - `sql/seed.sql`
- No historical monolith migrations are retained in this extracted CPQ scope.
