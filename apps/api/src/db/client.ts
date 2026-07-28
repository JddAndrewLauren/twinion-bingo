import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type Db = PostgresJsDatabase;

/**
 * postgres.js does not dial until the first query, so building this at startup
 * costs nothing and keeps the failure where it belongs — on the first request
 * rather than in a boot-time connection race with Fly's autostart.
 */
export function createDb(url: string): Db {
  return drizzle(postgres(url));
}
