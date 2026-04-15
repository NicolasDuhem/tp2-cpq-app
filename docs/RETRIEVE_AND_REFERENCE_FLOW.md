# Retrieve and configuration-reference flow

## 1) Save side (reference creation/update)

- API: `POST /api/cpq/configuration-references`
- Persistence target: `cpq_configuration_references`
- Key behavior:
  - validates required canonical fields,
  - normalizes nullable text fields,
  - stores `finalize_response_json` and `json_snapshot` as JSONB,
  - upserts on `configuration_reference`.

`configuration_reference` is unique and is the external key users reuse for retrieval.

## 2) Resolve side

- API: `GET /api/cpq/configuration-references?configuration_reference=...`
- Returns latest active row for the reference.
- Resolution filters on `is_active=true`.

## 3) Retrieve side (new working session)

- API: `POST /api/cpq/retrieve-configuration`

Sequence:
1. resolve canonical row by reference,
2. build StartConfiguration input from canonical row values,
3. call CPQ StartConfiguration,
4. return parsed state + new session ID to UI.

### Retrieve input composition rules
- `ruleset` and `namespace` come from resolved row.
- `headerId` prefers `canonical_header_id` then `header_id` then `'Simulator'`.
- `detailId` prefers `canonical_detail_id` then `finalized_detail_id`.
- `sourceHeaderId` prefers `source_header_id` then canonical/header fallback.
- `sourceDetailId` prefers `source_detail_id` then `canonical_detail_id`.
- account context fields (account/customer/currency/language/country/company/type) are restored when present.

## 4) Important clarification
No active CopyConfiguration call is part of this retrieve/reference flow in the current code path.
