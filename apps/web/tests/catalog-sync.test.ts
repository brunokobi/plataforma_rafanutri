// Catálogos usados dos dois lados (app web e extensão do Directus). A fonte é packages/catalogs; este teste confere
// que os módulos da extensão expõem os mesmos valores que o app usa.
import { describe, expect, it } from 'vitest';
import { REASON_LABEL } from '@/lib/clinical-dashboard/types';
import { LEGAL_VERSIONS } from '@/lib/legal/info';
import { SHARE_DEFAULTS } from '@/lib/patient-area/types';
import { ALLERGENS, CONSENT_LABEL, FEEDING_TYPE_LABEL, REACTION_LABEL, RELATIONSHIP_LABEL, TEXTURES } from '@/lib/maternal/feeding';
import { KIND_LABEL, REMINDER_HOURS } from '@/lib/notifications/types';
import { SCREENING_TOOLS } from '@rafanutri/nutrition-core';
import * as dash from '../../../directus/extensions/rafanutri/clinical-dashboard.js';
import * as maternal from '../../../directus/extensions/rafanutri/maternal.js';
import * as notifications from '../../../directus/extensions/rafanutri/notifications.js';
import * as ph from '../../../directus/extensions/rafanutri/public-health.js';
import * as extCatalogs from '../../../directus/extensions/rafanutri/catalogs.js';

const sorted = (a: Iterable<string | number>) => [...a].map(String).sort();

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
  it('a extensão usa a mesma cópia do catálogo que o app (versões dos termos e chaves do que o paciente vê)', () => {
    expect(extCatalogs.LEGAL_VERSIONS).toEqual(LEGAL_VERSIONS);
    expect(sorted(extCatalogs.SHARE_KEYS)).toEqual(Object.keys(SHARE_DEFAULTS).sort());
  });
});
