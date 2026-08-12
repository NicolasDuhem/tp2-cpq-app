import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL ?? '';
const client = databaseUrl ? neon(databaseUrl) : null;

export const sql = ((...args: Parameters<ReturnType<typeof neon>>) => {
  if (!client) throw new Error('DATABASE_URL is not set');
  return (client as ReturnType<typeof neon>)(...args);
}) as ReturnType<typeof neon>;
