import { describe, expect, it } from 'vitest';
import { moduleThemeOf } from '@/lib/modules/theme';

describe('tema por módulo', () => {
  it('a rota define o módulo (o mais específico vence)', () => {
    const id = '11111111-1111-1111-1111-111111111111';
    expect(moduleThemeOf('/app')).toBeNull();
    expect(moduleThemeOf('/app/configuracoes/plano')).toBeNull();
    expect(moduleThemeOf('/app/pacientes')).toBe('clinical');
    expect(moduleThemeOf(`/app/pacientes/${id}`)).toBe('clinical');
    expect(moduleThemeOf(`/app/pacientes/${id}/materno-infantil`)).toBe('maternal');
    expect(moduleThemeOf(`/app/pacientes/${id}/triagens`)).toBe('public_health');
    expect(moduleThemeOf('/app/saude-publica')).toBe('public_health');
    expect(moduleThemeOf('/app/uan/fichas')).toBe('uan');
    expect(moduleThemeOf('/app/assistente')).toBe('ai');
    expect(moduleThemeOf('/app/financeiro/')).toBe('practice');
    expect(moduleThemeOf('/app/agendamentos')).toBeNull();
  });
});
