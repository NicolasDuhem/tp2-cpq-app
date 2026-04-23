# Retrieve and configuration-reference flow

## 1) Save side (reference create/update)
- API: `POST /api/cpq/configuration-references`
- Service: `saveConfigurationReference()`
- table: `cpq_configuration_references`
- behavior:
  - accepts explicit `configuration_reference` or generates `CFG-YYYYMMDD-XXXXXXXX`
  - upserts by `configuration_reference`
  - stores canonical + source lineage + context + JSON fields

## 2) Resolve side
- API: `GET /api/cpq/configuration-references?configuration_reference=...`
- Service: `resolveConfigurationReference()`
- query filters by `configuration_reference` and `is_active=true`

## 3) Retrieve side (new working session)
- API: `POST /api/cpq/retrieve-configuration`
- input:
```json
{ "configuration_reference": "CFG-..." }
```
- steps:
  1) resolve active canonical row
  2) build StartConfiguration input using resolved ruleset/header/detail/source/context
  3) call CPQ StartConfiguration
  4) map response to normalized bike-builder state
  5) return resolved row + start input + new session state

## 4) Retrieval composition rules
- `headerId` precedence: `canonical_header_id` → `header_id` → `Simulator`
- `detailId` precedence: `canonical_detail_id` → `finalized_detail_id`
- source header/detail fall back to canonical/header defaults when missing
- context fields are taken from persisted canonical row when present

## 5) Important clarification
Retrieve starts a fresh CPQ session from saved canonical context.
It does not replay from sampler rows and does not re-open prior CPQ session IDs.
