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
