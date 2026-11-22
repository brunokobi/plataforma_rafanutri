import { describe, expect, it } from 'vitest';
import { isAthlete, moduleThemeOf, patientTheme } from '@/lib/modules/theme';

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
    expect(moduleThemeOf('/app/materno-infantil')).toBe('maternal');
    expect(moduleThemeOf('/app/esportivo')).toBe('sport');
  });

  it('atleta pelo objetivo e tema da ficha', () => {
    expect(isAthlete('Hipertrofia e definição')).toBe(true);
    expect(isAthlete('Preparar para a maratona de SP')).toBe(true);
    expect(isAthlete('Natação competitiva')).toBe(true);
    expect(isAthlete('Emagrecer 5 kg')).toBe(false);
    expect(isAthlete('Controle da natalidade')).toBe(false);
    expect(isAthlete(null)).toBe(false);
    expect(isAthlete('Manutenção de massa muscular')).toBe(false);
    expect(patientTheme({ objective: 'treino de força', birth_date: null }, 30, 'resumo')).toBe('sport');
    expect(patientTheme({ objective: 'treino de força', birth_date: null }, 8, 'resumo')).toBe('maternal');
    expect(patientTheme({ objective: null, birth_date: null }, 8, 'materno')).toBeNull();
    expect(patientTheme({ objective: null, birth_date: null }, 40, 'resumo')).toBeNull();
  });
});
