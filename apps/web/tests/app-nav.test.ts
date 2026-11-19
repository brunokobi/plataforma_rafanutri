import { describe, expect, it } from 'vitest';
import { activeHref, navModel } from '@/components/app/app-nav';

describe('menu do cabeçalho', () => {
  it('poucos atalhos principais; o resto no "Mais"', () => {
    const m = navModel('/app/pacientes');
    expect(m.primary.map((l) => l.label)).toEqual(['Módulos', 'Painel', 'Pacientes', 'Agenda', 'CRM', 'Financeiro']);
    expect(m.more.flatMap((g) => g.links.map((l) => l.label))).toContain('Receitas');
  });
  it('na UAN mostra os links da UAN', () => {
    const m = navModel('/app/uan/unidades/x');
    expect(m.primary.map((l) => l.label)).toContain('Conformidade');
    expect(m.primary.map((l) => l.label)).not.toContain('Pacientes');
  });
  it('link ativo é o mais específico; Módulos só na própria página', () => {
    const hrefs = ['/app', '/app/uan', '/app/uan/fichas', '/app/pacientes'];
    expect(activeHref('/app/uan/fichas/123', hrefs)).toBe('/app/uan/fichas');
    expect(activeHref('/app/uan/unidades/1', hrefs)).toBe('/app/uan');
    expect(activeHref('/app', hrefs)).toBe('/app');
    expect(activeHref('/app/agenda', hrefs)).toBeNull();
  });
});
