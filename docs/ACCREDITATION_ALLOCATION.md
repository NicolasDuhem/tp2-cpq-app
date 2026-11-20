# Accreditation Allocation

`/sales/accreditation-allocation`: which BigCommerce categories of the **Brompton B2B**
channel are eligible for each **country** and **accreditation level** (Gold, Silver, Bronze, …).

This is a self-contained feature. It adds new tables, new APIs and a new page. It does not
write to any table used by Bike Allocation, QPart Allocation, the allocation audit page or
the dashboard. The existing files it touches are additive one-liners: a new permission key
in `lib/auth/page-keys.ts` and a new nav entry in `components/shared/app-navigation.tsx`.

## Model

- **Levels** (`accreditation_levels`) are editable in the tool. Gold, Silver and Bronze are seeded.
  Every level is available to every country.
- **Countries** are the active rows of `cpq_country_mappings` (the same list as the other
  allocation pages), grouped Region → Sub-region → Country.
- **Categories** are the category tree of one BigCommerce channel, copied into Neon
  (`accreditation_bc_categories`) by **Sync categories from BigCommerce**. The tool stores
  and pushes **category ids** but displays **names**. BigCommerce has at most 3 levels
  (e.g. *Parts and accessories › Parts › Brakes*).
- **Eligibility** (`accreditation_category_eligibility`): one row per
  (channel, country, level, category) with `is_active`. **A missing row means Inactive**, so
  new countries, levels and categories all start Inactive.
- **Effective state**: a category is effectively eligible only when it **and every parent** are
  Active for the same country/level. In the matrix, a cell that is Active itself but blocked by
  an inactive parent is shown faded. The external table receives the effective state.

## Page behaviour (same UX as Bike Allocation)

- Toolbar:
  - **Territory**: the countries in scope. Selected countries set the visible columns and the
    target of bulk actions and push. With no selection, every country is shown and bulk
    actions are disabled.
  - **Levels**: which levels are shown as columns.
  - **Active / Inactive** status filter.
  - **Apply to sub-categories**: on by default. When on, clicking a cell also sets the same
    status on all sub-categories.
  - **Copy country…**, **Export CSV**, **Actions**, **Legend**.
- Matrix: rows are the category tree (collapsible, indented, `#id` shown, `hidden` tag for
  categories hidden in BigCommerce). There is one column per country × level, and countries
  are separated by a thicker border. Cells reuse the Bike Allocation cell component
  (Active/Inactive pill plus external sync icon).
- Search (category name or id prefix) and the status filter keep the matching rows' parent
  categories visible for context. Those context rows are greyed out and are **not** part of the
  bulk scope.
- **Actions**:
  - **Bulk activate / deactivate**: matching categories × selected countries × shown levels.
  - **Push selected countries**: re-sends to external PostgreSQL without changing anything in Neon.
  - **Refresh external status**: a read-only comparison against external PostgreSQL.
  - **Sync categories from BigCommerce**.
  - **Manage levels**: Admin only; shown as **View levels** otherwise.
  - **Expand all / Collapse all**.
- **Copy country…**: pick a source country and target countries. Every target gets exactly the
  source's state for all active levels × all current categories (overwrite). The change is
  audited and the targets are pushed.
- URL keeps the view shareable: `countries`, `levels`, `q`, `status`. All filtering is
  client-side because the dataset is small (categories × countries × levels).

## Permissions

Page key `sales.accreditation_allocation` (seeded by the migration; it appears in Setup → Users).

| Level | Can do |
| --- | --- |
| none | Nothing: the nav entry is hidden and APIs return 403 |
| read | View, refresh external status, export CSV |
| edit | + toggle, bulk, copy country, push, sync categories |
| admin | + add / rename / reorder / remove / restore levels |

## APIs (`/api/sales/accreditation-allocation/*`)

| Route | Access | Purpose |
| --- | --- | --- |
| `POST toggle` `{countryCode, levelId, categoryIds[], targetStatus}` | edit | One cell. The client sends the category plus its sub-categories when cascade is on. |
| `POST bulk-update` `{countryCodes[], levelIds[], categoryIds[], targetStatus}` | edit | Bulk Active/Inactive. Maximum 60,000 cells per call. |
| `POST copy` `{sourceCountryCode, targetCountryCodes[]}` | edit | Overwrite targets with the source matrix, then push them. |
| `POST push` `{countryCodes[]}` | edit | Re-push countries to external PostgreSQL. |
| `POST external-status` `{countryCodes[]}` | read | One batched read of the external table. |
| `POST categories/sync` | edit | Reload the channel tree from BigCommerce. |
| `GET/POST/PATCH levels` | read / admin / admin | List, create (`{label}`), update (`{id, label?, displayOrder?, isActive?}`). |
| `GET export?countries=&levels=` | read | CSV with `own_active` and `effective_active`. |

Write order is always **Neon first, then external PostgreSQL**. An external failure never rolls
back Neon. It is reported per country as **Error** so the operator can retry with Push.

## BigCommerce

`lib/bigcommerce/categories.ts` reuses `BIGCOMMERCE_API_BASE_URL`, `BIGCOMMERCE_STORE_HASH` and
`BIGCOMMERCE_ACCESS_TOKEN`. It does **not** depend on `BIGCOMMERCE_BC_STATUS_ENABLED`. The
token needs read access to Products (catalog trees/categories) and Channels.

Channel resolution, in order:

1. `BIGCOMMERCE_ACCREDITATION_CHANNEL_ID` set: use the tree assigned to that channel (`GET /v3/catalog/trees?channel_id:in=`).
2. Otherwise: use the tree named `BIGCOMMERCE_ACCREDITATION_TREE_NAME` (default `Brompton B2B`), then a channel with that name.

The tree is read with `GET /v3/catalog/trees/{tree_id}/categories` and flattened. Categories no
longer returned are marked `is_deleted` (their eligibility rows are kept, but hidden and not
pushed). An empty response changes nothing. Setting the channel id explicitly is recommended
for production.

## External PostgreSQL

Table `${EXTERNAL_PG_SCHEMA}.accreditation_category_eligibilities`. The DDL is in
`sql/external/2026-11-20_accreditation_category_eligibilities.sql` and must be run once on the
external database. `variants` and `variant_eligibilities` are not touched.

| Column | Value |
| --- | --- |
| `"ChannelId"` | BigCommerce channel id |
| `"CountryCode"` | ISO-2 country |
| `"AccreditationLevel"` | level **code** (e.g. `GOLD`; stable across renames) |
| `"CategoryId"` / `"ParentCategoryId"` | BigCommerce ids (`0` = top level) |
| `"CategoryName"` / `"CategoryDepth"` | for readability |
| `"IsActive"` | **effective** state |
| `"UpdatedAt"` | Unix seconds |

Each push replaces a whole country in one transaction: delete that country's rows for the
channel, then insert one row per active level × current category. This makes the table an
exact mirror and needs no unique index (one is still created by the DDL). Removing a level
deletes its external rows immediately. Restoring a level publishes it on the next push of each
country.

## Neon tables

Created by `sql/migrations/2026-11-20_accreditation_allocation.sql` (additive and re-runnable):

- `accreditation_levels`
- `accreditation_bc_categories`
- `accreditation_category_eligibility`
- `accreditation_allocation_audit_log`: one row per changed cell (`toggle`, `bulk_update`,
  `copy_country`) plus `category_sync`, `level_create/update/remove/restore`. It is kept
  separate from `app_allocation_audit_log` so the existing audit page is unaffected.

If the migration has not been run, the page shows a "Setup required" notice instead of failing.

## Code map

- `app/sales/accreditation-allocation/*`: route entry, loading and error states
- `components/sales/sales-accreditation-allocation-page.tsx`: server page (auth and data)
- `components/sales/sales-accreditation-allocation-table.client.tsx`: toolbar, matrix, copy and levels modals
- `components/sales/sales-accreditation-allocation-page.module.css`: page-specific styles (otherwise reuses the Bike Allocation module)
- `lib/sales/accreditation-allocation/service.ts`: Neon reads/writes, copy, levels, sync, push
- `lib/sales/accreditation-allocation/tree.ts` (+ `tree.test.ts`): pure tree helpers (flatten, ancestors, effective state, filtering)
- `lib/bigcommerce/categories.ts`: BigCommerce tree reader
- `lib/external-pg/accreditation-eligibility.ts`: external writer/reader

## Go-live checklist

1. Run `sql/migrations/2026-11-20_accreditation_allocation.sql` on Neon.
2. Run `sql/external/2026-11-20_accreditation_category_eligibilities.sql` on the external PostgreSQL.
3. Set `BIGCOMMERCE_ACCREDITATION_CHANNEL_ID` (Brompton B2B channel id) in Vercel.
4. Grant `sales.accreditation_allocation` to users in Setup → Users.
5. Open the page and click **Sync categories from BigCommerce**.
6. Set up one country, then use **Copy country…** for the others.
