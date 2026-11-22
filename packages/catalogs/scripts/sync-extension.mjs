// Copia os catálogos para a extensão do Directus (que roda sem build e sem acesso ao monorepo).
// Rode depois de alterar src/catalogs.js: pnpm --filter @rafanutri/catalogs sync
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../src/catalogs.js');
const to = resolve(here, '../../../directus/extensions/rafanutri/catalogs.js');
copyFileSync(from, to);
console.log(`copiado: ${to}`);
