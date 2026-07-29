import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type Db = PostgresJsDatabase;

/**
 * The handle a `db.transaction` callback is handed. It is not `Db`, so anything
 * that must run inside somebody else's transaction — dealing a late joiner their
 * card, appending the prizes a call earned — takes this rather than the pool.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * postgres.js does not dial until the first query, so building this at startup
 * costs nothing and keeps the failure where it belongs — on the first request
 * rather than in a boot-time connection race with Fly's autostart.
 */
export function createDb(url: string): Db {
  return drizzle(postgres(url));
}
