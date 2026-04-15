# CPQ Database Save Flow (Neon) — Manual Lifecycle

## Canonical intent

Manual saved configurations are persisted to `cpq_configuration_references` via `POST /api/cpq/configuration-references`.

`CPQ_sampler_result` remains a secondary/support table for sampler/image sync workflows; it receives an automatic row after canonical save but is still not the retrieve source of truth.

---

## Table focus: `cpq_configuration_references`

## Purpose

Stores stable, retrievable identities for manually finalized CPQ configurations, plus enough context to re-open configuration in CPQ and to audit what was finalized.

## Field-by-field intent (current code contract)

> Note: runtime code expects a superset that includes canonical and lineage columns. See “Schema alignment risk” below.

### Identity/core

- `id` — surrogate PK.
- `configuration_reference` — unique external reference key (`CFG-YYYYMMDD-XXXXXXXX`) used for retrieve.
- `ruleset` — CPQ ruleset/part name used to restart config.
- `namespace` — CPQ namespace used to restart config.
- `header_id` — header id associated with saved row.
- `finalized_detail_id` — finalized detail id for saved state.

### Canonical retrieval identity (runtime-required)

- `canonical_header_id` — preferred header for retrieval start.
- `canonical_detail_id` — preferred detail id for retrieval start.

### Lineage and session tracing

- `source_working_detail_id` — working detail id seen in live pre-finalize state.
- `source_session_id` — live session id before finalize/save.
- `source_header_id` — source header id returned or inferred.
- `source_detail_id` — source detail id returned or inferred.
- `finalized_session_id` — session used when finalize/save occurred.

### Account/context snapshot

- `account_code`, `customer_id`, `account_type`, `company`, `currency`, `language`, `country_code`, `customer_location`.

### Product/final output snapshot

- `final_ipn_code` — extracted IPN at final save stage.
- `product_description` — extracted product description at final save stage.

### Payload/debug snapshots

- `finalize_response_json` — raw finalize route response object as JSONB.
- `json_snapshot` — object containing normalized parsed state from latest Configure (fallback StartConfiguration), selected options, save-source marker, finalize raw payload, timestamp.

### Record lifecycle

- `is_active` — retrieval filter requires `true`.
- `created_at`, `updated_at` — timestamps.

---

## Mandatory vs optional fields (as enforced by code)

## Required by `saveConfigurationReference()`

- `ruleset`
- `namespace`
- `canonical_detail_id` (or fallback `finalized_detail_id`)
- `configuration_reference` (auto-generated if omitted)

## Required-by-shape but auto-defaulted

- `canonical_header_id` → defaults to `header_id` then `'Simulator'`
- `header_id` → defaults to canonical header
- `finalized_detail_id` → defaults to canonical detail
- `finalize_response_json` → defaults `{}` if undefined
- `json_snapshot` → defaults `{}` if undefined

## Optional

All context/lineage/product fields can be null/empty.

---

## Source-of-truth mapping by lifecycle stage

## From StartConfiguration input + setup tables

- `ruleset` (selected ruleset)
- `namespace` (from setup ruleset)
- `header_id` / `canonical_header_id` (from setup ruleset)
- account context fields (`account_code`, `customer_id`, `currency`, `language`, `country_code`, company/account_type/customer_location derivations)

## From latest working source state (preferred Configure, fallback StartConfiguration)

- `source_working_detail_id` (`state.detailId`)
- `source_session_id` and `finalized_session_id` (`state.sessionId`)
- `source_header_id`, `source_detail_id` from selected source state (not finalize payload body)
- final parsed content fields used for save snapshot (`final_ipn_code`, `product_description`, selected options)

## From FinalizeConfiguration response/state

- `finalized_detail_id` and `canonical_detail_id` from `parsed.detailId` or fallback to prior state detail id
- `finalize_response_json` raw object for audit/debug
- finalize payload is **not** the canonical snapshot source

## Automatic secondary write after canonical save

- After canonical upsert success, UI writes one row to `CPQ_sampler_result`.
- Sampler row payload uses the same selected source snapshot (latest Configure, fallback StartConfiguration).
- Finalize payload is excluded as sampler snapshot source.

---

## Exact save sequence

1. Frontend runs finalize.
2. If finalize success, frontend derives `finalizedDetailId`.
3. Frontend posts save payload to `/api/cpq/configuration-references`.
4. Route delegates to `saveConfigurationReference()`.
5. Service validates/normalizes input, generates `configuration_reference` if needed.
6. Service upserts row in `cpq_configuration_references` on `configuration_reference` conflict.
7. Route returns saved row; UI shows saved reference and closes live session state.

---

## Retrieve sufficiency assessment

Current persisted data is **largely sufficient** for retrieve because route builds StartConfiguration from:

- canonical IDs (`canonical_header_id`, `canonical_detail_id`) with fallbacks,
- ruleset/namespace,
- source IDs,
- account/context snapshot,
- optional application instance.

This supports “retrieve and create a new live CPQ session from saved reference”.

However, correctness depends on canonical columns existing in DB schema and populated consistently.

---

## Schema alignment risk (important)

`lib/cpq/runtime/configuration-references.ts` expects columns:

- `canonical_header_id`
- `canonical_detail_id`
- `source_working_detail_id`
- `source_session_id`

But current `sql/schema.sql` table definition shown in repo does not include these fields.

That means a fresh DB created strictly from current `sql/schema.sql` may fail manual save flow unless additional migration(s) already applied outside this file.

---

## Explicit confirmations requested

- `CPQ_sampler_result` is **not** the canonical manual save path.
- `cpq_configuration_references` is the implemented source of truth for manual save/retrieve lifecycle.
