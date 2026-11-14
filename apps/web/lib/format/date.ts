/**
 * Datas sempre no horário de Brasília, igual no servidor (UTC) e no navegador: sem isso o texto
 * renderizado no servidor difere do navegador (erro de hidratação do React) e a data pode cair no dia errado.
 * Data sem hora ("2026-11-11") é tratada como o próprio dia.
 */
export function dateBR(iso: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString('pt-BR', { ...opts, timeZone: 'America/Sao_Paulo' });
}
