// Identidade visual por módulo: cada área da plataforma tem cores, fonte de título e fundo próprios
// (app/globals.css, seletores [data-module-page] e [data-module-scope]).

export type ModuleTheme = 'clinical' | 'sport' | 'maternal' | 'practice' | 'ai' | 'uan' | 'public_health';

export const MODULE_THEME_LABEL: Record<ModuleTheme, string> = {
  clinical: 'Clínico',
  sport: 'Esportivo',
  maternal: 'Materno-infantil',
  practice: 'Gestão do consultório',
  ai: 'Assistente de IA',
  uan: 'UAN e Qualidade',
  public_health: 'Saúde pública',
};

/** Tema da rota (o mais específico vence). Início, conta e configurações gerais ficam com a marca padrão. */
export function moduleThemeOf(pathname: string): ModuleTheme | null {
  const p = pathname.replace(/\/+$/, '');
  if (/^\/app\/pacientes\/[^/]+\/materno-infantil(\/|$)/.test(p) || p.startsWith('/app/materno-infantil')) return 'maternal';
  if (p.startsWith('/app/esportivo')) return 'sport';
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

/** Objetivo com cara de esporte: treino, competição, modalidade ou composição corporal para desempenho. */
const SPORT = /\b(atleta|esport\w*|desempenho|performance|hipertrofia|treino|treinos|competi\w*|maratona|corrida|corredor\w*|triatl\w*|ciclis\w*|nata[cç][aã]o|nadador\w*|futebol|crossfit|muscula\w*|fisiculturis\w*|lutador\w*|jiu|bodybuilding|ganho de massa|massa muscular|pr[ée]-treino|p[óo]s-treino)\b/i;
export function isAthlete(objective: string | null | undefined): boolean {
  return Boolean(objective && SPORT.test(objective.normalize('NFC')));
}

/**
 * Tema da ficha conforme o paciente: criança (até 11 anos) com o visual infantil e atleta com o esportivo.
 * Não vale nas abas que já têm o próprio módulo (Materno-infantil e Triagens).
 */
export function patientTheme(p: { objective: string | null; birth_date: string | null }, ageYears: number | null, tab: string): ModuleTheme | null {
  if (tab === 'materno' || tab === 'triagens') return null;
  if (ageYears !== null && ageYears < 12) return 'maternal';
  if (isAthlete(p.objective)) return 'sport';
  return null;
}
