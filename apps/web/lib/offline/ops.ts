// RN-149 — Fila offline do checklist: tipos e regras puras (compactação e ordem de envio).
import type { AnswerValue } from '@/lib/uan/checklists';

export type OfflineOp =
  | { id?: number; kind: 'answer'; runId: string; position: number; input: { value?: AnswerValue; number_value?: number | null; comment?: string | null }; at: string }
  | { id?: number; kind: 'photo'; runId: string; position: number; image: string; at: string }
  | { id?: number; kind: 'complete'; runId: string; at: string };

/**
 * Compacta a fila de um checklist: para cada item fica só a última resposta e a última foto; a conclusão vai
 * no fim. Respostas antes das fotos do mesmo item (a foto só é aceita depois da resposta "não conforme").
 */
export function compact(ops: OfflineOp[]): OfflineOp[] {
  const answers = new Map<string, OfflineOp>();
  const photos = new Map<string, OfflineOp>();
  let complete: OfflineOp | null = null;
  for (const op of ops) {
    if (op.kind === 'complete') complete = op;
    else (op.kind === 'answer' ? answers : photos).set(`${op.runId}:${op.position}`, op);
  }
  const byTime = (a: OfflineOp, b: OfflineOp) => a.at.localeCompare(b.at) || (a.id ?? 0) - (b.id ?? 0);
  return [...[...answers.values()].sort(byTime), ...[...photos.values()].sort(byTime), ...(complete ? [complete] : [])];
}

/** Ids que a compactação descartou (para apagar do armazenamento). */
export function superseded(ops: OfflineOp[]): number[] {
  const keep = new Set(compact(ops).map((o) => o.id));
  return ops.filter((o) => o.id !== undefined && !keep.has(o.id)).map((o) => o.id!);
}

/** Resultado do envio de uma operação: segue, para (sem rede) ou descarta (o servidor recusou de vez). */
export type SendOutcome = 'sent' | 'offline' | 'rejected';

/**
 * Como tratar a resposta do servidor: falha de rede para e tenta depois; "já concluído" na conclusão conta como
 * enviado (idempotente); outras recusas descartam a operação e avisam.
 */
export function outcomeOf(op: OfflineOp, r: { ok: true } | { ok: false; message: string; network?: boolean }): SendOutcome {
  if (r.ok) return 'sent';
  if (r.network) return 'offline';
  if (op.kind === 'complete' && /já concluído/i.test(r.message)) return 'sent';
  return 'rejected';
}
