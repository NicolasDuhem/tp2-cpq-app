export const PERMISSION_LEVELS = ['none', 'read', 'edit', 'admin'] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export function normalizePermissionLevel(value: unknown): PermissionLevel {
  return typeof value === 'string' && (PERMISSION_LEVELS as readonly string[]).includes(value) ? (value as PermissionLevel) : 'none';
}
