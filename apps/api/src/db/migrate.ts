import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Applies this project's migration chain. Run it — never apply SQL by hand:
 *
 *   DATABASE_URL=postgres://... pnpm --filter @twinion-bingo/api db:migrate
 *
 * The migrations journal lives in the `bingo` schema too, so twinion's own
 * chain in `public` is untouched.
 */
const url = process.env.DATABASE_URL;
if (url === undefined || url === '') {
  throw new Error('DATABASE_URL must be set to run migrations.');
}

const client = postgres(url, {
  max: 1,
  // Re-running is meant to be a no-op, and Postgres says so once per
  // `IF NOT EXISTS` statement. Anything else still gets printed.
  onnotice: (notice) => {
    const alreadyExists = notice.code === '42P06' || notice.code === '42P07';
    if (!alreadyExists) console.warn(notice.message);
  },
});

// `migrationsSchema` keeps the journal table in `bingo` rather than drizzle's
// default `drizzle` schema, which the twinion project's own chain already owns
// in this database — two projects sharing one journal table would be worse than
// no isolation at all.
await migrate(drizzle(client), {
  migrationsFolder: 'drizzle',
  migrationsSchema: 'bingo',
});

await client.end();

console.log('bingo migrations applied');
