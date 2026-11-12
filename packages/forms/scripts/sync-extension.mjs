// Copia o validador para a extensão do Directus (que roda sem build e sem acesso ao monorepo).
// Rode depois de alterar src/forms.js: pnpm --filter @rafanutri/forms sync
import { copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../src/forms.js');
const to = resolve(here, '../../../directus/extensions/rafanutri/forms.js');
copyFileSync(from, to);
console.log(`copiado: ${to}`);
