import { sql } from '@/lib/db/client';
import { hashPassword, normalizeEmail, verifyPassword } from '@/lib/auth/password';
import type { PermissionLevel } from '@/lib/auth/permissions';

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const PERMS: PermissionLevel[] = ['none', 'read', 'edit', 'admin'];

export async function listPermissionPages() { return sql`select page_key, page_label, route_path, nav_group, display_order from app_permission_pages where is_active=true order by nav_group nulls last, display_order, page_label`; }
export async function listUsers() { return sql`select id, email, display_name, is_active, is_system_admin, last_login_at, created_at from app_users order by created_at desc`; }
export async function getUserByEmail(email: string) { const rows = await sql`select * from app_users where lower(email)=${normalizeEmail(email)} limit 1`; return rows[0]; }
export async function createUser(input: any) {
  if (!input.displayName?.trim()) throw new Error('Display name is required');
  const email = normalizeEmail(String(input.email ?? ''));
  if (!isEmail(email)) throw new Error('Valid email is required');
  if (!input.password || String(input.password).length < 10) throw new Error('Password must be at least 10 characters');
  const row = (await sql`insert into app_users (email, display_name, password_hash, is_active, is_system_admin) values (${email}, ${input.displayName.trim()}, ${hashPassword(input.password)}, ${!!input.isActive}, ${!!input.isSystemAdmin}) returning id`) [0] as {id:string};
  await setPermissions(row.id, input.permissions ?? {});
  return row.id;
}
export async function setPermissions(userId:string, permissions: Record<string, PermissionLevel>) { for (const [pageKey, level] of Object.entries(permissions)) { if (!PERMS.includes(level)) continue; await sql`insert into app_user_page_permissions (user_id, page_key, permission_level) values (${userId}, ${pageKey}, ${level}) on conflict (user_id, page_key) do update set permission_level = excluded.permission_level, updated_at = now()`; } }
export async function updateUser(id: string, input:any) {
  const email = normalizeEmail(String(input.email ?? ''));
  if (!isEmail(email)) throw new Error('Valid email is required');
  if (!input.displayName?.trim()) throw new Error('Display name is required');
  await sql`update app_users set email=${email}, display_name=${input.displayName.trim()}, is_active=${!!input.isActive}, is_system_admin=${!!input.isSystemAdmin}, updated_at=now() where id=${id}`;
  if (input.password && String(input.password).trim().length > 0) {
    if (String(input.password).length < 10) throw new Error('Password must be at least 10 characters');
    await sql`update app_users set password_hash=${hashPassword(input.password)}, updated_at=now() where id=${id}`;
  }
  await setPermissions(id, input.permissions ?? {});
}
export async function authenticateUser(email: string, password: string) { const user = await getUserByEmail(email); if (!user || !user.is_active) return null; if (!verifyPassword(password, user.password_hash)) return null; await sql`update app_users set last_login_at=now() where id=${user.id}`; return user; }
