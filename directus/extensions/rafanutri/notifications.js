// Avisos ao paciente (0058): regras puras — canal, janelas de lembrete, textos e validação.
// Telegram primeiro para tudo (gratuito); e-mail só para os avisos importantes, quando o paciente não tem
// Telegram ligado ou o envio pelo Telegram falhou.

export const ALLOWED_HOURS = [1, 2, 3, 6, 12, 24, 48, 72];
export const TZ = 'America/Sao_Paulo';

/** Tipos de aviso e se merecem e-mail quando não há Telegram. */
export const KINDS = {
  appointment_reminder: { label: 'Lembrete de consulta', important: false },   // o primeiro lembrete é importante (ver isImportant)
  appointment_scheduled: { label: 'Consulta marcada', important: true },
  appointment_changed: { label: 'Consulta remarcada', important: true },
  appointment_cancelled: { label: 'Consulta cancelada', important: true },
  plan_published: { label: 'Plano novo', important: false },
  patient_invite: { label: 'Convite da área do paciente', important: true },
  test: { label: 'Teste', important: true },
  invoice_created: { label: 'Fatura da assinatura', important: true },
  invoice_due: { label: 'Fatura vencendo', important: true },
  payment_reported: { label: 'Pagamento informado', important: true },
  payment_confirmed: { label: 'Pagamento confirmado', important: true },
  subscription_ended: { label: 'Assinatura encerrada', important: true },
  feeding_reaction: { label: 'Reação na introdução alimentar', important: true },
};

/** Nomes dos alergênicos (apps/web/lib/maternal/feeding.ts). */
const FEEDING_ITEM_LABEL = { egg: 'ovo', peanut: 'amendoim', cow_milk: 'leite de vaca', wheat: 'trigo', fish: 'peixe', shellfish: 'frutos do mar', soy: 'soja', tree_nuts: 'castanhas', sesame: 'gergelim' };

/** O primeiro lembrete (o de mais horas de antecedência) vale e-mail; os seguintes só vão pelo Telegram. */
export function isImportant(kind, { hour = null, hours = [] } = {}) {
  if (kind === 'appointment_reminder') return hour != null && hour === Math.max(...hours);
  return Boolean(KINDS[kind]?.important);
}

/**
 * Canal do aviso. prefs: { email_opt_in, telegram_opt_in, telegram_chat_id }; email: do cadastro do paciente.
 * skipTelegram: o Telegram já falhou para este aviso (vai para a reserva por e-mail).
 */
export function pickChannel({ important, prefs, email, skipTelegram = false }) {
  const p = prefs ?? { email_opt_in: true, telegram_opt_in: true, telegram_chat_id: null };
  if (!skipTelegram && p.telegram_opt_in !== false && p.telegram_chat_id != null) return { channel: 'telegram', recipient: String(p.telegram_chat_id) };
  // Domínios reservados para teste (RFC 2606) nunca recebem: evita e-mail devolvido.
  if (important && p.email_opt_in !== false && typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !/@(example\.(com|org|net)|[^@]+\.(test|invalid|example))$/i.test(email)) return { channel: 'email', recipient: email };
  return null;
}

/**
 * Janelas de lembrete: o lembrete de H horas sai quando a consulta está entre (próximo menor, H] horas.
 * Assim, consulta marcada em cima da hora recebe só o lembrete da janela em que caiu.
 */
export function reminderWindows(hours) {
  const sorted = [...new Set(hours)].filter((h) => ALLOWED_HOURS.includes(h)).sort((a, b) => a - b);
  return sorted.map((h, i) => ({ hour: h, lower: i === 0 ? 0 : sorted[i - 1] }));
}

/** "terça, 25/11 às 14:30" no fuso do consultório. */
export function formatWhen(date) {
  const d = date instanceof Date ? date : new Date(date);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: TZ }).replace('-feira', '');
  const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  return `${weekday}, ${day} às ${time}`;
}

const firstName = (full) => String(full ?? '').trim().split(/\s+/)[0] || 'Olá';
const modeLine = (a) => (a.mode === 'online' ? (a.meeting_url ? `Consulta on-line: ${a.meeting_url}` : 'Consulta on-line: o link chega antes do horário.') : null);

/**
 * Texto do aviso. ctx: { patientName, practice, appointment?: { starts_at, mode, meeting_url }, hour?, note?, link? }.
 * Devolve { subject, lines, link }: as linhas viram parágrafos no e-mail e no Telegram.
 */
export function buildMessage(kind, ctx) {
  const name = firstName(ctx.patientName);
  const practice = ctx.practice || 'seu consultório';
  const a = ctx.appointment;
  const when = a ? formatWhen(a.starts_at) : '';
  switch (kind) {
    case 'appointment_reminder': {
      const lead = ctx.hour >= 24 ? `Lembrete: sua consulta com ${practice} é ${when}.` : `Sua consulta com ${practice} começa em breve: ${when}.`;
      return { subject: `Lembrete da sua consulta — ${when}`, lines: [`Olá, ${name}!`, lead, modeLine(a), ctx.note || null, 'Se não puder vir, avise o consultório o quanto antes.'].filter(Boolean), link: ctx.link ?? null };
    }
    case 'appointment_scheduled':
      return { subject: `Consulta marcada — ${when}`, lines: [`Olá, ${name}!`, `Sua consulta com ${practice} está marcada para ${when}.`, modeLine(a)].filter(Boolean), link: ctx.link ?? null };
    case 'appointment_changed':
      return { subject: `Consulta remarcada — ${when}`, lines: [`Olá, ${name}!`, `Sua consulta com ${practice} foi remarcada para ${when}.`, modeLine(a)].filter(Boolean), link: ctx.link ?? null };
    case 'appointment_cancelled':
      return { subject: 'Consulta cancelada', lines: [`Olá, ${name}!`, `Sua consulta com ${practice} de ${when} foi cancelada.`, 'Para marcar outro horário, fale com o consultório.'], link: ctx.link ?? null };
    case 'plan_published':
      return { subject: 'Seu novo plano alimentar está disponível', lines: [`Olá, ${name}!`, `${practice} publicou seu novo plano alimentar. Ele já está na sua área do paciente.`], link: ctx.link ?? null };
    case 'patient_invite':
      return { subject: `${practice} convidou você para a área do paciente`, lines: [`Olá, ${name}!`, `Seu plano alimentar e as orientações de ${practice} agora ficam na sua área do paciente.`, 'Crie seu acesso pelo link abaixo. Ele vale 7 dias.'], link: ctx.link ?? null };
    case 'invoice_created':
      return { subject: `Fatura da Rafanutri — plano ${ctx.planName}, ${ctx.amount}`, lines: [`Olá, ${name}!`, `A fatura do plano ${ctx.planName} de ${practice} está disponível: ${ctx.amount}, período de ${ctx.period}, vencimento ${ctx.due}.`, 'Pague pelo Pix (QR code ou copia e cola) na página da fatura e toque em "Já paguei". A confirmação sai em até 1 dia útil.'], link: ctx.link ?? null };
    case 'invoice_due':
      return { subject: ctx.late ? `Fatura em atraso — plano ${ctx.planName}` : `Sua fatura vence hoje — ${ctx.amount}`, lines: [`Olá, ${name}!`, ctx.late ? `A fatura do plano ${ctx.planName} (${ctx.amount}) venceu em ${ctx.due}. Sem o pagamento até ${ctx.cutoff}, ${practice} volta ao plano Gratuito.` : `A fatura do plano ${ctx.planName} (${ctx.amount}) vence hoje, ${ctx.due}.`, 'Já pagou? Toque em "Já paguei" na página da fatura.'], link: ctx.link ?? null };
    case 'payment_reported':
      return { subject: `Pix informado: ${practice} — ${ctx.amount}`, lines: [`${practice} informou o pagamento da fatura do plano ${ctx.planName} (${ctx.amount}, identificador ${ctx.txid}).`, 'Confira no extrato e confirme na administração.'], link: ctx.link ?? null };
    case 'payment_confirmed':
      return { subject: `Pagamento confirmado — plano ${ctx.planName}`, lines: [`Olá, ${name}!`, `Recebemos o pagamento de ${ctx.amount}. O plano ${ctx.planName} de ${practice} está ativo até ${ctx.until}.`, 'Obrigado por usar a Rafanutri!'], link: ctx.link ?? null };
    case 'subscription_ended':
      return { subject: `Assinatura encerrada — ${practice}`, lines: [`Olá, ${name}!`, `A assinatura do plano ${ctx.planName} de ${practice} terminou e o consultório voltou ao plano Gratuito. Seus dados continuam guardados.`, 'Para voltar ao plano pago, assine de novo em Meu plano.'], link: ctx.link ?? null };
    case 'feeding_reaction': {
      const item = FEEDING_ITEM_LABEL[ctx.item] ?? ctx.item;
      const level = ctx.reaction === 'severe' ? 'grave' : 'moderada';
      return { subject: `Reação ${level} na introdução alimentar — ${ctx.childName}`, lines: [`Olá, ${name}!`, `O responsável por ${ctx.childName} registrou no app uma reação ${level} a ${item}.`, 'Veja os detalhes na aba Materno-infantil da ficha e oriente a família.'], link: ctx.link ?? null };
    }
    case 'test':
      return { subject: 'Teste de aviso da Rafanutri', lines: [`Olá, ${name}!`, `Este é um teste dos avisos de ${practice}. Se você recebeu, está tudo certo.`], link: ctx.link ?? null };
    default:
      throw new Error(`tipo de aviso desconhecido: ${kind}`);
  }
}

/** Texto puro (fila e e-mail em texto). */
export const plainBody = (msg) => msg.lines.join('\n\n');

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export { escapeHtml };

/** Mensagem do Telegram em HTML (parse_mode HTML): assunto em negrito, parágrafos e link. */
export function telegramHtml({ subject, body, link }) {
  const parts = [`<b>${escapeHtml(subject)}</b>`, ...String(body).split('\n\n').map(escapeHtml)];
  if (link) parts.push(`<a href="${escapeHtml(link)}">Abrir</a>`);
  return parts.join('\n\n').slice(0, 4096);
}

/** Configurações do consultório. Devolve { value } ou { errors }. */
export function validateSettings(b) {
  const errors = {};
  const bool = (k) => (typeof b?.[k] === 'boolean' ? b[k] : (errors[k] = 'Valor inválido.', null));
  const reminders_enabled = bool('reminders_enabled');
  const scheduled_enabled = bool('scheduled_enabled');
  const plan_enabled = bool('plan_enabled');
  const hours = Array.isArray(b?.reminder_hours) ? [...new Set(b.reminder_hours.map(Number))] : null;
  if (!hours || hours.some((h) => !ALLOWED_HOURS.includes(h)) || hours.length > 3) errors.reminder_hours = 'Escolha até 3 horários de lembrete.';
  else if (reminders_enabled && hours.length === 0) errors.reminder_hours = 'Escolha pelo menos um horário de lembrete.';
  const note = typeof b?.reminder_note === 'string' ? b.reminder_note.trim().replace(/\s+/g, ' ') : '';
  if (note.length > 300) errors.reminder_note = 'Recado de até 300 caracteres.';
  if (Object.keys(errors).length) return { errors };
  return { value: { reminders_enabled, scheduled_enabled, plan_enabled, reminder_hours: hours.sort((x, y) => y - x), reminder_note: note || null } };
}

/** Token do comando /start do bot (link t.me/<bot>?start=<token>). */
export function parseStart(text) {
  const m = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{43})\s*$/.exec(String(text ?? '').trim());
  return m ? m[1] : null;
}

/** Comando para parar os avisos no Telegram. */
export const isStop = (text) => /^\/(parar|stop)(?:@\w+)?\s*$/i.test(String(text ?? '').trim());

/** Erro do Telegram que significa "este chat não recebe mais" (bloqueou o bot ou apagou a conta). */
export const isTelegramGone = (status, description = '') => status === 403 || (status === 400 && /chat not found|user is deactivated/i.test(description));
