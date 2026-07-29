import { createDb, type Db } from '../../src/db/client.js';

/**
 * A database the app can hold but never reaches — postgres.js only dials on the
 * first query, so the health and CORS tests can build a real app without a
 * container behind it.
 */
export function unconnectedDb(): Db {
  return createDb('postgres://unused');
}
