# Architecture (current implementation)

## 1) Application scope
This repository is a CPQ-focused Next.js app with operational setup, runtime configuration, sampler analytics, and sales allocation orchestration.

Primary routes:
- `/cpq` (Bike Builder runtime)
- `/cpq/setup` (setup + picture management)
- `/cpq/results` (sampler matrix)
- `/cpq/process` (SOP content)
- `/cpq/ui-docs` (UI mapping table)
- `/sales/bike-allocation` (sales allocation matrix + launch-to-CPQ)

Aliases:
- `/` → `/cpq`
- `/bike-builder` → `/cpq`

## 2) Shell/navigation/auth model
- `app/layout.tsx` wraps pages in `AppShell`.
- `AppShell` provides brand header + nav + `AdminModeProvider`.
- Admin mode is client-side only (sessionStorage key `tp2-cpq-admin-mode`, password `Br0mpt0n`).
- Non-admin nav shows Process, Sales allocation, Bike Builder, Setup.
- Admin nav additionally shows Sampler Results and UI Docs.

Important boundary: this is **not** server-enforced authentication/RBAC; it is UI visibility gating.

## 3) Page architecture
- `/cpq` → `components/cpq/bike-builder-page.tsx`
  - Start/Configure/Finalize lifecycle
  - canonical save/retrieve
  - sampler save
  - layered image preview
  - combination generation + bulk row-country execution
  - replay ingestion from sales launch context
- `/cpq/setup` → `components/setup/cpq-setup-page.tsx`
  - CRUD: account context/rulesets
  - picture management editing
  - feature-level ignore + layer-order controls
  - sampler sync into `cpq_image_management`
- `/cpq/results` → `components/cpq/cpq-results-page.tsx` + client matrix component
- `/sales/bike-allocation` → server data loader + client matrix/toggle/bulk/replay launcher
- `/cpq/process` and `/cpq/ui-docs` are static-ish client-doc pages.

## 4) API architecture
### CPQ runtime routes
- `POST /api/cpq/init`
- `POST /api/cpq/configure`
- `POST /api/cpq/finalize`
- `POST /api/cpq/retrieve-configuration`

### CPQ persistence/setup routes
- `POST/GET /api/cpq/configuration-references`
- `POST /api/cpq/sampler-result`
- `POST /api/cpq/image-layers`
- `GET/POST/PUT/DELETE /api/cpq/setup/account-context*`
- `GET/POST/PUT/DELETE /api/cpq/setup/rulesets*`
- `GET/PUT/POST /api/cpq/setup/picture-management*`

### Sales routes
- `POST /api/sales/bike-allocation/toggle`
- `POST /api/sales/bike-allocation/bulk-update`
- `POST /api/sales/bike-allocation/launch-context`

## 5) Data boundaries
- `cpq_configuration_references` = canonical saved configuration registry for retrieve.
- `CPQ_sampler_result` = support snapshots + sales allocation status source (`active`).
- `CPQ_setup_account_context`, `CPQ_setup_ruleset` = setup/master tables.
- `cpq_image_management` = layered preview mapping + feature-level bulk-ignore and layer order.

## 6) Feature flags/runtime switches
- `NEXT_PUBLIC_CPQ_DEBUG=true`: client debug timeline capture in `/cpq` (still admin-visible only).
- `CPQ_USE_MOCK=true`: mock responses for init/configure routes.

## 7) Known constraints
- UI admin mode is not security.
- `/cpq/results` can be opened directly by URL even when admin tab is hidden.
- `/cpq/ui-docs` route renders for all users, but its component content gates detailed table to admin mode.
