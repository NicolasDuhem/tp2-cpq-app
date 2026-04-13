# PROCESSDATA

## 1) Builder runtime flow
- Primary UI: `/cpq`.
- Alias UI: `/bike-builder` redirects to `/cpq`.
- Calls:
  - `POST /api/cpq/init`
  - `POST /api/cpq/configure`

## 2) Sampler process
- Triggered from builder traversal controls.
- Persists snapshots via `POST /api/cpq/sampler-result`.
- Persists into `CPQ_sampler_result`.

## 3) Setup management
- `/cpq/setup` exposes exactly:
  - Account code management
  - Ruleset management
  - Picture management
- Backed by `/api/cpq/setup/*` routes.

## 4) Results browsing
- `/cpq/results` loads latest rows per IPN from `CPQ_sampler_result`.
- Uses picture mappings from `cpq_image_management`.
