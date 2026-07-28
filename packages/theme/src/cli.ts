import { fileURLToPath } from 'node:url';
import { buildAllThemes } from './generate.js';

// Default to the repo's own themes/ folder; an argument overrides it for tests.
const themesRoot = process.argv[2] ?? fileURLToPath(new URL('../../../themes', import.meta.url));

for (const built of buildAllThemes(themesRoot)) {
  console.log(`${built.theme}: ${built.squareCount} squares -> ${built.path}`);
}
