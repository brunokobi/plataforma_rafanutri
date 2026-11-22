import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as c from '../src/catalogs.js';

describe('@rafanutri/catalogs', () => {
  it('a cópia da extensão está igual à fonte (rode pnpm --filter @rafanutri/catalogs sync)', () => {
    const src = readFileSync(resolve(__dirname, '../src/catalogs.js'), 'utf8');
    const copy = readFileSync(resolve(__dirname, '../../../directus/extensions/rafanutri/catalogs.js'), 'utf8');
    expect(copy).toBe(src);
  });
  it('códigos sem repetição e coerentes', () => {
    expect(new Set(c.ALLERGENS.map((a) => a.code)).size).toBe(c.ALLERGENS.length);
    expect(new Set(c.TEXTURES.map((a) => a.code)).size).toBe(c.TEXTURES.length);
    expect(c.SERIOUS_REACTIONS.every((r) => r in c.REACTION_LABEL)).toBe(true);
    expect([...c.REMINDER_HOURS].sort((a, b) => b - a)).toEqual([...c.REMINDER_HOURS]);
    expect(c.PRACTICE_PLANS.every((p) => p in c.AI_DAILY_LIMIT)).toBe(true);
  });
  it('tipos de aviso iguais ao CHECK do banco (migração mais recente que o define)', () => {
    const sql = readFileSync(resolve(__dirname, '../../../db/migrations/0065_maternal_care.sql'), 'utf8');
    const check = sql.match(/notification_outbox_kind_check check \(kind in \(([\s\S]*?)\)\)/)?.[1] ?? '';
    const kinds = [...check.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    expect(Object.keys(c.NOTIFICATION_KINDS).sort()).toEqual(kinds);
  });
  it('chaves do que o paciente vê iguais às aceitas pelo banco', () => {
    const sql = readFileSync(resolve(__dirname, '../../../db/migrations/0065_maternal_care.sql'), 'utf8');
    const keys = sql.match(/k not in \(([^)]*)\)/)?.[1] ?? '';
    expect([...keys.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()).toEqual([...c.SHARE_KEYS].sort());
  });
});
