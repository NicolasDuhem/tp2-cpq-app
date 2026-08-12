import 'server-only';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'crypto';
import { sql } from '@/lib/db/client';
import { normalizePermissionLevel, type PermissionLevel } from '@/lib/auth/permission-level';

export const AUTH_COOKIE_NAME = 'tp2_session';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const authCookieOptions = (expires?: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  ...(expires ? { expires } : { maxAge: 0 }),
  path: '/',
});

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TTL_MS);
  await sql`insert into app_sessions (user_id, session_token_hash, expires_at) values (${userId}, ${hashToken(token)}, ${expires.toISOString()})`;
  cookies().set(AUTH_COOKIE_NAME, token, authCookieOptions(expires));
}

export async function clearSession() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (token) await sql`delete from app_sessions where session_token_hash = ${hashToken(token)}`;
  cookies().set(AUTH_COOKIE_NAME, '', authCookieOptions());
}

export async function getUserPermissions(userId: string) {
  const rows = await sql`select page_key, permission_level from app_user_page_permissions where user_id = ${userId}` as Array<{ page_key: string; permission_level: string }>;
  return Object.fromEntries(rows.map((r) => [r.page_key, normalizePermissionLevel(r.permission_level)])) as Record<string, PermissionLevel>;
}

export async function getCurrentUser() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const rows = await sql`select u.id, u.email, u.display_name, u.is_system_admin from app_sessions s join app_users u on u.id = s.user_id where s.session_token_hash = ${hashToken(token)} and s.expires_at > now() and u.is_active=true limit 1` as Array<{id:string;email:string;display_name:string;is_system_admin:boolean}>;
  const user = rows[0];
  if (!user) return null;
  return { id: user.id, email: user.email, displayName: user.display_name, isSystemAdmin: user.is_system_admin, permissions: await getUserPermissions(user.id) };
}

export async function requireCurrentUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error('Unauthorized');
  return u;
}
