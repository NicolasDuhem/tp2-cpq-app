import { neon, type NeonQueryPromise } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL ?? '';
// Widened to the same instantiation `sql` is exported as, so queries built with `sql` are
// accepted by `client.transaction` below without further casting.
const client = (databaseUrl ? neon(databaseUrl) : null) as ReturnType<typeof neon> | null;

export const sql = ((...args: Parameters<ReturnType<typeof neon>>) => {
  if (!client) throw new Error('DATABASE_URL is not set');
  return client(...args);
}) as ReturnType<typeof neon>;

/** Lazy Neon query object, as produced by the `sql` tagged template above when not awaited. */
type NeonLazyQuery = NeonQueryPromise<boolean, boolean>;

/**
 * Runs the supplied queries as a single non-interactive Postgres transaction over HTTP
 * (all statements committed together, or none of them).
 *
 * The exported `sql` above is a wrapper function, so `sql.transaction` does not exist at
 * runtime — this helper reaches the underlying Neon client. Queries must be built with
 * `sql` and passed **unawaited**; Neon query objects are lazy and only execute here.
 *
 * Non-interactive means the whole statement list is fixed up front: a later statement
 * cannot consume an earlier statement's result within the same transaction.
 */
export const sqlTransaction = async (queries: NeonLazyQuery[]) => {
  if (!client) throw new Error('DATABASE_URL is not set');
  return client.transaction(queries);
};
