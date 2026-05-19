import { PERMISSION_LEVELS, type PermissionLevel } from '@/lib/auth/permission-level';

const ORDER: PermissionLevel[] = [...PERMISSION_LEVELS];
export function hasPagePermission(user: { isSystemAdmin: boolean; permissions: Record<string, PermissionLevel> } | null, pageKey: string, minimumLevel: PermissionLevel): boolean { if (!user) return false; if (user.isSystemAdmin) return true; return ORDER.indexOf(user.permissions[pageKey] ?? 'none') >= ORDER.indexOf(minimumLevel); }
export const canReadPage = (u: { isSystemAdmin: boolean; permissions: Record<string, PermissionLevel> } | null, p: string) => hasPagePermission(u, p, 'read');
export const canEditPage = (u: { isSystemAdmin: boolean; permissions: Record<string, PermissionLevel> } | null, p: string) => hasPagePermission(u, p, 'edit');
export const canAdminPage = (u: { isSystemAdmin: boolean; permissions: Record<string, PermissionLevel> } | null, p: string) => hasPagePermission(u, p, 'admin');
