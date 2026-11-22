// Catálogos que existem dos dois lados (app web e extensão do Directus) precisam ser iguais.
// Se um lado mudar sem o outro, este teste falha.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REASON_LABEL } from '@/lib/clinical-dashboard/types';
import { LEGAL_VERSIONS } from '@/lib/legal/info';
import { ALLERGENS, CONSENT_LABEL, FEEDING_TYPE_LABEL, REACTION_LABEL, RELATIONSHIP_LABEL, TEXTURES } from '@/lib/maternal/feeding';
import { KIND_LABEL, REMINDER_HOURS } from '@/lib/notifications/types';
import { SCREENING_TOOLS } from '@rafanutri/nutrition-core';
import * as dash from '../../../directus/extensions/rafanutri/clinical-dashboard.js';
import * as maternal from '../../../directus/extensions/rafanutri/maternal.js';
import * as notifications from '../../../directus/extensions/rafanutri/notifications.js';
import * as ph from '../../../directus/extensions/rafanutri/public-health.js';

const sorted = (a: Iterable<string | number>) => [...a].map(String).sort();
const indexJs = readFileSync(resolve(__dirname, '../../../directus/extensions/rafanutri/index.js'), 'utf8');

describe('catálogos web × extensão', () => {
  it('motivos de atenção do painel: mesmas chaves e mesmos textos', () => {
    expect(REASON_LABEL).toEqual(dash.REASONS);
  });
  it('materno-infantil: alergênicos, texturas, reações, aleitamento, parentesco e consentimento', () => {
    expect(sorted(ALLERGENS.map((a) => a.code))).toEqual(sorted(maternal.ALLERGENS));
    expect(sorted(TEXTURES.map((t) => t.code))).toEqual(sorted(maternal.TEXTURES));
    expect(sorted(Object.keys(REACTION_LABEL))).toEqual(sorted(maternal.REACTIONS));
    expect(sorted(Object.keys(FEEDING_TYPE_LABEL))).toEqual(sorted(maternal.FEEDING_TYPES));
    expect(sorted(Object.keys(RELATIONSHIP_LABEL))).toEqual(sorted(maternal.RELATIONSHIPS));
    expect(sorted(Object.keys(CONSENT_LABEL))).toEqual(sorted(maternal.CONSENT_METHODS));
  });
  it('avisos: todos os tipos têm rótulo e os horários de lembrete são os mesmos', () => {
    expect(sorted(Object.keys(KIND_LABEL))).toEqual(sorted(Object.keys(notifications.KINDS)));
    expect(sorted(REMINDER_HOURS)).toEqual(sorted(notifications.ALLOWED_HOURS));
  });
  it('triagens: mesmas ferramentas e versões', () => {
    expect(Object.fromEntries(Object.entries(SCREENING_TOOLS).map(([k, t]) => [k, t.version]))).toEqual(ph.TOOLS);
  });
  it('versões dos termos e chaves do que o paciente vê', () => {
    const legal = indexJs.match(/const LEGAL_VERSIONS = (\{[^}]+\})/)?.[1];
    expect(legal && JSON.parse(legal.replace(/(\w+):/g, '"$1":').replace(/'/g, '"'))).toEqual(LEGAL_VERSIONS);
    const keys = indexJs.match(/const SHARE_KEYS = \[([^\]]+)\]/)?.[1]?.match(/'(\w+)'/g)?.map((k) => k.slice(1, -1));
    expect(sorted(keys ?? [])).toEqual(['show_kcal', 'show_macros', 'show_maternal', 'show_weight_history']);
  });
});
