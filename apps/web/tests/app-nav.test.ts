import { describe, expect, it } from 'vitest';
import { activeHref, initials, navModel } from '@/components/app/app-nav';

describe('menu lateral', () => {
  it('grupos do consultório, com UAN só quando o consultório tem o módulo', () => {
    const g = navModel('/app/pacientes');
    expect(g.map((x) => x.title)).toEqual([null, 'Atendimento', 'Gestão', 'Conteúdo', 'Conta']);
    expect(g.flatMap((x) => x.links.map((l) => l.label))).toEqual(expect.arrayContaining(['Início', 'Pacientes', 'Assistente de IA', 'Receitas', 'Meu plano']));
    expect(g.flatMap((x) => x.links.map((l) => l.label))).not.toContain('UAN e Qualidade');
    expect(navModel('/app', { uan: true }).flatMap((x) => x.links.map((l) => l.label))).toContain('UAN e Qualidade');
  });
  it('na UAN mostra os links da UAN', () => {
    const labels = navModel('/app/uan/unidades/x').flatMap((g) => g.links.map((l) => l.label));
    expect(labels).toContain('Conformidade');
    expect(labels).not.toContain('Pacientes');
  });
  it('link ativo é o mais específico; Início só na própria página', () => {
    const hrefs = ['/app', '/app/uan', '/app/uan/fichas', '/app/pacientes'];
    expect(activeHref('/app/uan/fichas/123', hrefs)).toBe('/app/uan/fichas');
    expect(activeHref('/app/uan/unidades/1', hrefs)).toBe('/app/uan');
    expect(activeHref('/app', hrefs)).toBe('/app');
    expect(activeHref('/app/agenda', hrefs)).toBeNull();
  });
  it('iniciais do consultório', () => {
    expect(initials('Consultório de Teste Rafanutri')).toBe('CT');
    expect(initials('Ana')).toBe('A');
  });
});
