// Mensagens entre paciente e nutricionista (0071). Tipos e regras puras usadas pelo chat dos dois lados.

export type Sender = 'patient' | 'professional';

export interface ChatMessage {
  id: string;
  sender: Sender;
  body: string;
  created_at: string;
  read_at: string | null;
}

/** Página da conversa vinda do servidor. peer_read_at: até quando o outro lado já leu as minhas. */
export interface ChatPage {
  messages: ChatMessage[];
  has_more: boolean;
  peer_read_at: string | null;
}

export interface PatientChat extends ChatPage {
  patient_id: string;
  enabled: boolean;
  practice: string | null;
  professional: string | null;
}

export interface ProChat extends ChatPage {
  patient: { id: string; name: string; active: boolean; linked: boolean; phone: string | null };
}

export interface Conversation {
  patient_id: string;
  name: string;
  active: boolean;
  linked: boolean;
  last: { sender: Sender; body: string; created_at: string; read_at: string | null };
  unread: number;
}

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; message: string; retry: boolean };

export const MAX_BODY = 4000;
export const TZ = 'America/Sao_Paulo';

/** Junta mensagens novas às que já estão na tela, sem repetir (por id) e em ordem de envio. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (!incoming.length) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });

/** "Hoje", "Ontem", "segunda-feira" (até 6 dias) ou "12/11/2026". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const key = dayKey(iso);
  const today = dayKey(now.toISOString());
  const diff = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${key}T12:00:00Z`)) / 864e5);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff > 1 && diff < 7) return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: TZ });
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
}

export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

/** Horário curto da lista de conversas: hora se for hoje, "Ontem", ou a data. */
export function listTimeLabel(iso: string, now: Date = new Date()): string {
  const d = dayLabel(iso, now);
  if (d === 'Hoje') return timeLabel(iso);
  if (d === 'Ontem') return d;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ });
}

export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; message: ChatMessage; first: boolean; last: boolean };

/** Linhas da conversa: separador de dia e, em cada mensagem, se abre/fecha um grupo do mesmo remetente. */
export function chatRows(messages: ChatMessage[], now: Date = new Date()): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay = '';
  messages.forEach((m, i) => {
    const day = dayKey(m.created_at);
    if (day !== lastDay) {
      rows.push({ kind: 'day', key: `d-${day}`, label: dayLabel(m.created_at, now) });
      lastDay = day;
    }
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const near = (a?: ChatMessage, b?: ChatMessage) => Boolean(a && b && a.sender === b.sender && dayKey(a.created_at) === dayKey(b.created_at) && Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < 5 * 60e3);
    rows.push({ kind: 'msg', key: m.id, message: m, first: !near(prev, m), last: !near(m, next) });
  });
  return rows;
}

/** Quebra o texto em pedaços de texto e links (http/https), para mostrar os links clicáveis. */
export function linkify(text: string): Array<{ text: string; href?: string }> {
  const out: Array<{ text: string; href?: string }> = [];
  const rx = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
  let at = 0;
  for (const m of text.matchAll(rx)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index) });
    out.push({ text: m[0], href: m[0] });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
