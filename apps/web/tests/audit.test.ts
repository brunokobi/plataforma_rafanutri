import { describe, expect, it } from 'vitest';
import { auditQuery, parseAuditFilters } from '@/lib/audit/types';

const U = '3f0c2b9e-1d2a-4c5b-8e7f-0a1b2c3d4e5f';

describe('filtros da auditoria', () => {
  it('aceita só valores válidos', () => {
    expect(parseAuditFilters({ from: '2026-11-01', to: 'ontem', actor: U, entity: 'clinical_notes', action: 'read', before: '120' }))
      .toEqual({ from: '2026-11-01', actor: U, entity: 'clinical_notes', action: 'read', before: '120' });
    expect(parseAuditFilters({ entity: 'directus_users', action: 'drop', actor: 'x', patient: ['a', 'b'], before: '1; drop' })).toEqual({});
  });

  it('monta a query na ordem fixa e sem vazios', () => {
    expect(auditQuery({})).toBe('');
    expect(auditQuery({ before: '9', entity: 'patients', from: '2026-01-01' })).toBe('?from=2026-01-01&entity=patients&before=9');
  });
});
