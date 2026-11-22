// Identidade visual por módulo: cada área da plataforma tem cores, fonte de título e fundo próprios
// (app/globals.css, seletores [data-module-page] e [data-module-scope]).

export type ModuleTheme = 'clinical' | 'maternal' | 'practice' | 'ai' | 'uan' | 'public_health';

export const MODULE_THEME_LABEL: Record<ModuleTheme, string> = {
  clinical: 'Clínico e Esportivo',
  maternal: 'Materno-infantil',
  practice: 'Gestão do consultório',
  ai: 'Assistente de IA',
  uan: 'UAN e Qualidade',
  public_health: 'Saúde pública',
};

/** Tema da rota (o mais específico vence). Início, conta e configurações gerais ficam com a marca padrão. */
export function moduleThemeOf(pathname: string): ModuleTheme | null {
  const p = pathname.replace(/\/+$/, '');
  if (/^\/app\/pacientes\/[^/]+\/materno-infantil(\/|$)/.test(p)) return 'maternal';
  if (/^\/app\/pacientes\/[^/]+\/triagens(\/|$)/.test(p) || p.startsWith('/app/saude-publica')) return 'public_health';
  if (p.startsWith('/app/uan')) return 'uan';
  if (p.startsWith('/app/assistente')) return 'ai';
  if (['/app/crm', '/app/financeiro', '/app/agenda'].some((r) => p === r || p.startsWith(`${r}/`))) return 'practice';
  if (['/app/clinico', '/app/pacientes', '/app/alimentos', '/app/receitas', '/app/modelos-de-plano', '/app/questionarios', '/app/orientacoes'].some((r) => p === r || p.startsWith(`${r}/`))) return 'clinical';
  return null;
}

/** Tema do cartão de cada módulo na tela inicial (códigos do catálogo). */
export const THEME_OF_MODULE: Record<string, ModuleTheme | undefined> = {
  clinical: 'clinical', patient_area: 'clinical', practice: 'practice', ai: 'ai', maternal: 'maternal', uan: 'uan', public_health: 'public_health',
};
