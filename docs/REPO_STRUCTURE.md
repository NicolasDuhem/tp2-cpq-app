# REPO_STRUCTURE

## Folder layout
- `app/`
  - Route-only files (`page.tsx`, API route handlers).
  - `app/cpq/*` for retained CPQ routes.
  - `app/api/cpq/*` and `app/api/cpq/setup/*` for retained API surface.
- `components/`
  - `components/cpq/`: Bike Builder and CPQ results UI components.
  - `components/setup/`: CPQ setup UI component.
  - `components/shared/`: shared shell/navigation components.
- `lib/`
  - `lib/cpq/runtime/`: CPQ runtime integration (client/config/mappers/mock/persistence).
  - `lib/cpq/setup/`: setup services + picture-layer/sync logic.
  - `lib/cpq/results/`: results read model/service.
  - `lib/db/`: database client.
- `types/`
  - `types/cpq.ts`: CPQ runtime/shared DTOs.
  - `types/setup.ts`: setup/image-management/shared setup DTOs.
- `sql/`
  - `schema.sql`, `seed.sql`.
- `docs/`
  - repository and extraction documentation.

## Route placement
- Route handlers/pages are intentionally thin wrappers in `app/`.
- Page-level UI and behavior live in `components/*` to keep route files migration-friendly.

## Runtime/setup boundary
- Runtime-specific code is isolated in `lib/cpq/runtime`.
- Setup-specific data access and picture sync live in `lib/cpq/setup`.
- Results aggregation lives in `lib/cpq/results`.

## Alias decision
- `/cpq` is the canonical Bike Builder URL.
- `/bike-builder` is retained as a compatibility alias and now redirects to `/cpq`.
