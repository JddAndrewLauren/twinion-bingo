import { defineConfig } from 'drizzle-kit';

/**
 * This project shares a database with the twinion project (D3), and drizzle-kit
 * manages *all* schemas by default — pointed at the shared database without a
 * filter it would see twinion's `public` tables as absent and generate drops for
 * them. `schemaFilter` is the guarantee that prevents that, and the `out`
 * directory below keeps this project's migration chain entirely its own.
 *
 * Nothing here reads a default connection string on purpose: migrations run via
 * `pnpm --filter @twinion-bingo/api db:migrate` with an explicit DATABASE_URL.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['bingo'],
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
