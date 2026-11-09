// Aplica as migrações de db/migrations em ordem, uma vez cada, em transação.
// Uso: node --env-file=infra/directus/.env scripts/db-migrate.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const url =
  process.env.DATABASE_URL ??
  `postgres://rafanutri:${encodeURIComponent(process.env.DB_PASSWORD ?? '')}@127.0.0.1:${process.env.DB_PORT ?? 55432}/rafanutri`;
const dir = new URL('../db/migrations/', import.meta.url).pathname;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`create table if not exists rafanutri_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await client.query('select name from rafanutri_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    process.stdout.write(`aplicando ${file}... `);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into rafanutri_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
    } catch (err) {
      await client.query('rollback');
      console.log('ERRO');
      throw err;
    }
  }
  console.log('migrações em dia');
} finally {
  await client.end();
}
