// RN-166 — Exportação CSV dos registros (separador ";" e BOM para abrir certo no Excel em português).
import type { DossierData } from '@/lib/uan/legal';

export type CsvKind = 'temperaturas' | 'checklists' | 'nao-conformidades' | 'treinamentos';
export const CSV_KINDS: Array<{ kind: CsvKind; label: string }> = [
  { kind: 'temperaturas', label: 'Temperaturas' }, { kind: 'checklists', label: 'Checklists' },
  { kind: 'nao-conformidades', label: 'Não conformidades' }, { kind: 'treinamentos', label: 'Treinamentos' },
];

const cell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  // Evita fórmula no Excel (=, +, -, @) e escapa aspas
  const safe = /^[=+\-@]/.test(s) && !/^-?\d+(,\d+)?$/.test(s) ? `'${s}` : s;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const d = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export function toCsv(rows: unknown[][]): string {
  return `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}

/** Linhas do CSV de um tipo, a partir dos dados do dossiê do período. */
export function csvRows(kind: CsvKind, data: DossierData): unknown[][] {
  switch (kind) {
    case 'temperaturas':
      return [['Data e hora', 'Equipamento ou alimento', 'Temperatura (°C)', 'Mínimo', 'Máximo', 'Fora do limite', 'Ação corretiva', 'Registrado por'],
        ...data.temperatures.map((t) => [dt(t.recorded_at), t.target, t.value, t.min, t.max, t.out_of_range ? 'sim' : 'não', t.corrective_action, t.by])];
    case 'checklists':
      return [['Concluído em', 'Checklist', 'Pontuação (%)', 'Conformes', 'Não conformes', 'Não se aplica', 'Responsável', 'Itens não conformes', 'Hash SHA-256'],
        ...data.checklists.map((c) => [dt(c.completed_at), c.template_name, c.score, c.conform, c.non_conform, c.na, c.completed_by, c.failures.map((f) => `${f.critical ? '[crítico] ' : ''}${f.prompt}${f.comment ? ` (${f.comment})` : ''}`).join(' | '), c.content_hash])];
    case 'nao-conformidades':
      return [['Aberta em', 'Origem', 'Não conformidade', 'Gravidade', 'Prazo', 'Situação', 'Fechada em', 'Nota de fechamento', 'Planos de ação'],
        ...data.non_conformities.map((n) => [dt(n.opened_at), n.source, n.title, n.severity, dt(n.due_at), n.status, dt(n.closed_at), n.closing_note, n.plans])];
    case 'treinamentos':
      return [['Data', 'Tema', 'Carga horária (h)', 'Instrutor', 'Participantes'],
        ...data.trainings.map((t) => [d(t.held_on), t.topic, t.hours, t.instructor, t.attendees.join(', ')])];
  }
}
