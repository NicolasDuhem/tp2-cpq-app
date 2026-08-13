# Auth and Permissions

## Added model
- `app_users`: local users with hashed password (`password_hash`), `is_active`, `is_system_admin`.
- `app_permission_pages`: canonical page permission registry.
- `app_user_page_permissions`: per-user permission level (`none|read|edit|admin`).
- `app_sessions`: DB-backed sessions with hashed session token and 7-day TTL.

## Password hashing
- Passwords are hashed server-side with `crypto.scrypt` + random salt.
- Plain passwords are never stored or returned in API responses.

## Session model
- Login creates DB session and sets `tp2_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production).
- `/api/auth/me` resolves current user + page permissions.
- `/api/auth/logout` deletes DB session and cookie.

## Bootstrap first admin
Set env vars and run:
- `APP_BOOTSTRAP_ADMIN_EMAIL`
- `APP_BOOTSTRAP_ADMIN_NAME`
- `APP_BOOTSTRAP_ADMIN_PASSWORD`
- `npm run bootstrap:admin`

The script only inserts a user if `app_users` is empty.

## Enforced now
- User management APIs are permission-guarded after bootstrap (`setup.users = admin` or system admin).
- Login foundation and per-page permission helpers are active.

## Intentionally not enforced yet
- No global route/middleware lock yet.
- Existing pages remain accessible without mandatory login.

## Future audit trail integration
Use current session actor (`app_users.id`), `page_key`, old/new values, timestamp and action metadata for Active/Inactive changes on sales allocation pages.

## Temporary transition behavior (May 19, 2026)
- Global login lock is intentionally **not** enabled yet.
- During this phase, `/setup/users` APIs/pages remain testable when no session exists.
- When a valid session exists, setup-user admin permission model still applies.

## API response contracts used by UI
- `GET /api/setup/users` → `{ users: [...] }`
- `GET /api/setup/permission-pages` → `{ pages: [...] }`
- `GET /api/auth/me` → `{ user: null | { id, email, displayName, isSystemAdmin, permissions } }`

## Login test flow
1. Open `/login`.
2. Enter email/password and click **Login**.
3. Click **Test current login** to call `/api/auth/me` and inspect current user payload.
4. Header user menu (`👤`) shows logged-in identity and allows **Logout**.

## 2026-05-19 auth/session + allocation permission enforcement updates
- Fixed auth endpoints and client fetches to use no-store + credentials include and explicit auth refresh events.
- Added strict page-key enforcement for sales.bike_allocation and sales.qpart_allocation on allocation APIs (read vs edit).
- Added page-level login/access denied handling on Bike Allocation and QPart Allocation pages.
- Added temporary access-level debug text in Bike Allocation page header.
- Global middleware lock and audit trail remain intentionally out of scope.


### Allocation audit permissions context
- Audit rows capture actor id/email/display from authenticated session when available; nullable actor fields are allowed for no-session flows.
- Allocation audit rows for Bike/QPart toggles also include nullable `bigcommerce_status` (`OK|NOK|ERR|DISABLED|UNKNOWN`) sourced from existing Neon-side BC mapping data, without additional per-row BigCommerce API calls.

- New page key: `sales.allocation_audit` (read-only page; read/edit/admin/system-admin can view, none cannot).

## CPQ replay validation admin page (2026-08-13)

- New page key: `admin.cpq_replay_validation` (added to `PAGE_KEYS`, seeded by `sql/migrations/2026-08-13_admin_cpq_replay_validation_permission.sql`, and surfaced automatically in the Setup → Users matrix because that matrix is driven by `app_permission_pages`).
- Route: `/admin/cpq-replay-validation`, nav entry `CPQ replay validation` in the Bike Configurator section.
- Access behaviour:
  - `none` → hidden from nav, page shows access denied, APIs return 403.
  - `read` → can load dropdowns/references and run replay validation.
  - `edit` → same as read (the page performs no writes).
  - `admin` → same as read.
  - system admin → bypass.
- All three APIs use `requirePageRead(PAGE_KEYS.adminCpqReplayValidation)`; there is deliberately no `requirePageEdit` path because the feature is read-only against Neon.
- No global login lock was added.

## CPQ replay controlled overwrite permission (2026-08-13)

- `POST /api/admin/cpq-replay-validation/overwrite` requires **Admin** on `admin.cpq_replay_validation`.
- New helper `requirePageAdmin(pageKey)` in `lib/auth/page-access.ts` returns `{ user, forbidden }`: a 403 response when the caller is not logged in or lacks Admin, and the resolved user on success so the acting user can be recorded on the archive row.
- Effective behaviour on this page:
  - `none` → no access at all.
  - `read` / `edit` → run replay validation and view comparison results; the overwrite button is disabled and the API rejects the call.
  - `admin` → may apply selected replay results.
  - system admin → bypass.
- Server-side enforcement is the control; the disabled button is only a UI affordance.
- The overwrite writes an archive row (`app_cpq_replay_overwrite_archive`) capturing the acting user, but deliberately does **not** write `app_allocation_audit_log`.
