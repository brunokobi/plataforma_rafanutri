// Gera o SQL que grava os modelos padrão de questionário (organization_id nulo) a partir dos
// JSON desta pasta. Idempotente (upsert pelo id fixo de cada modelo).
// Uso: node db/seed/questionnaires/seed-sql.mjs | ssh vpsrafa 'docker exec -i rafanutri-postgres psql -U rafanutri -d rafanutri -v ON_ERROR_STOP=1'
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;

const rows = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')));

console.log('begin;');
for (const t of rows) {
  console.log(
    `insert into questionnaire_templates (id, organization_id, name, description, schema) values (${lit(t.id)}, null, ${lit(t.name)}, ${lit(t.description ?? '')}, ${lit(JSON.stringify(t.schema))}::jsonb)
on conflict (id) do update set name = excluded.name, description = excluded.description, schema = excluded.schema, is_active = true
where questionnaire_templates.organization_id is null;`,
  );
}
console.log(`do $$ begin raise notice 'modelos padrão: % gravados', ${rows.length}; end $$;`);
console.log('commit;');
