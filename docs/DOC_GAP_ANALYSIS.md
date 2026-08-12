# Documentation Gap Analysis

## Scope and method
- Reviewed markdown docs in repository (`README.md` and `docs/*.md`).
- Compared claims against current implementation in:
  - page routes/components (`app/**`, `components/**`)
  - API handlers (`app/api/**`)
  - service/data layer (`lib/**`)
  - schema/migrations (`sql/**`)
- Source of truth for this pass: current code.

## Gap register

| Markdown file | What it claimed before this pass | Gap found vs current code | Code evidence | Severity | Status |
|---|---|---|---|---|---|
| `README.md` | Route list omitted Sales allocation; non-admin tabs listed without Sales tab. | Nav includes `/sales/bike-allocation`; should be documented as first-class route. | `components/shared/app-navigation.tsx`, `app/sales/bike-allocation/page.tsx` | Important | Fixed |
| `docs/README.md` | Mentioned legacy source-of-truth framing and older audit orientation. | Needed explicit current hierarchy and new audit/page docs entrypoints. | `docs/*` set + current repo structure | Important | Fixed |
| `docs/ARCHITECTURE.md` | Focused on CPQ routes, did not fully include Sales route/API architecture boundary. | Sales page and `/api/sales/bike-allocation/*` are active and coupled to CPQ replay. | `app/sales/bike-allocation/page.tsx`, `app/api/sales/bike-allocation/*`, `lib/sales/bike-allocation/service.ts` | Critical | Fixed |
| `docs/REPO_STRUCTURE.md` | Missing `sales` component/service ownership and sales API scope. | Ownership map incomplete for active folders/routes. | `components/sales/*`, `lib/sales/bike-allocation/service.ts`, `app/api/sales/*` | Important | Fixed |
| `docs/CPQ_API_PAYLOADS.md` | Documented CPQ/setup APIs but not full sales payload contracts. | Active sales APIs were undocumented. | `app/api/sales/bike-allocation/toggle/route.ts`, `bulk-update/route.ts`, `launch-context/route.ts` | Critical | Fixed |
| `docs/DATABASE.md` | Framed live CSV export as authoritative in prior text. | Current code-first audit policy required code/schema-backed truth; also needed clear write-path ownership including sales status writes. | `lib/cpq/runtime/*`, `lib/cpq/setup/service.ts`, `lib/sales/bike-allocation/service.ts`, `sql/schema.sql` | Important | Fixed |
| `docs/PROCESSDATA.md` | Partially covered sales allocation, but needed consolidated flow language and explicit replay/write contracts. | Needed clearer end-to-end mapping: page action -> API -> DB write/read. | `components/sales/sales-bike-allocation-table.client.tsx`, `lib/sales/bike-allocation/service.ts`, `components/cpq/bike-builder-page.tsx` | Important | Fixed |
| `docs/CPQ_MANUAL_LIFECYCLE.md` | Mostly correct, but lacked concise security boundary and updated wording around support saves. | Clarified non-contracts and canonical/support split. | `components/cpq/bike-builder-page.tsx`, `lib/cpq/runtime/persistence.ts`, `components/shared/admin-mode-context.tsx` | Minor | Fixed |
| `docs/CPQ_DATABASE_SAVE_FLOW.md` | Mostly correct but needed tighter alignment with current write ownership and failure boundaries. | Updated for current save + sampler sequence wording. | `components/cpq/bike-builder-page.tsx`, `lib/cpq/runtime/configuration-references.ts`, `lib/cpq/runtime/persistence.ts` | Minor | Fixed |
| `docs/RETRIEVE_AND_REFERENCE_FLOW.md` | Needed explicit precedence rules for retrieve payload composition. | Added exact fallback ordering and behavior caveats. | `app/api/cpq/retrieve-configuration/route.ts` | Important | Fixed |
| `docs/MAIN_APP_DEEP_DIVE.md` | Prior deep dive underrepresented active sales integration in concise form. | Added current-app framing including sales flow dependency. | `components/sales/*`, `lib/sales/bike-allocation/service.ts`, `components/cpq/bike-builder-page.tsx` | Important | Fixed |
| `docs/DOCUMENTATION_GAP_ANALYSIS.md` | Older historical audit represented as active. | Could mislead maintainers; now marked historical and superseded. | `docs/DOCUMENTATION_GAP_ANALYSIS.md` | Minor | Fixed |
| `docs/CANONICAL_SAVE_CAPABILITY_GAP.md` | Historical note about copy capability not in runtime. | No functional mismatch found. | `lib/cpq/runtime/copy-configuration.ts`, runtime routes | Minor | Left as-is |
| `docs/EXTRACTION_REPORT.md` | Historical extraction context. | No runtime claim mismatch (already historical). | `docs/EXTRACTION_REPORT.md` | Minor | Left as-is |
| `docs/STOCK_BIKE_IMG_EXPERIMENT.md` | Historical experiment archive. | No action required for active runtime docs in this pass. | `docs/STOCK_BIKE_IMG_EXPERIMENT.md` | Minor | Left as-is |

## New gaps discovered and addressed in this pass
1. Missing complete page/component documentation for all user-facing pages.
   - **Fixed by adding:** `docs/PAGES_AND_COMPONENTS.md`.
2. No single active audit file with severity and fix-state table for all markdown docs.
   - **Fixed by adding:** `docs/DOC_GAP_ANALYSIS.md`.

## Remaining ambiguities (intentionally left)
- Runtime schema expectation for some canonical columns (`canonical_header_id`, `canonical_detail_id`, `source_working_detail_id`) can exceed minimal baseline in `sql/schema.sql` for brand-new environments; documented but not changed in code during this doc-only pass.
