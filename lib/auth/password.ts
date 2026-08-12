import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
const KEYLEN = 64;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export function hashPassword(password: string): string { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, KEYLEN).toString('hex')}`; }
export function verifyPassword(password: string, stored: string): boolean { const [salt, expected] = stored.split(':'); if (!salt || !expected) return false; const derived = scryptSync(password, salt, KEYLEN).toString('hex'); return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(derived, 'hex')); }
