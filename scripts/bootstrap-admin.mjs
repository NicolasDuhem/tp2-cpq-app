import { neon } from '@neondatabase/serverless';
import { randomBytes, scryptSync } from 'crypto';
const sql = neon(process.env.DATABASE_URL || '');
const email = (process.env.APP_BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const name = (process.env.APP_BOOTSTRAP_ADMIN_NAME || '').trim();
const password = process.env.APP_BOOTSTRAP_ADMIN_PASSWORD || '';
if (!email || !name || password.length < 10) throw new Error('Set APP_BOOTSTRAP_ADMIN_EMAIL, APP_BOOTSTRAP_ADMIN_NAME, APP_BOOTSTRAP_ADMIN_PASSWORD (>=10 chars).');
const count = await sql`select count(*)::int as c from app_users`;
if (count[0].c > 0) { console.log('app_users already has rows; bootstrap skipped.'); process.exit(0); }
const salt = randomBytes(16).toString('hex');
const hash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
await sql`insert into app_users (email, display_name, password_hash, is_active, is_system_admin) values (${email}, ${name}, ${hash}, true, true)`;
console.log('Bootstrap admin created:', email);
