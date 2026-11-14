// RN-068 — Regras puras do agendamento online (horários livres e validação do pedido).
import { normalizePhone } from './crm.js';

const pad = (n) => String(n).padStart(2, '0');
const toMin = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5));

/** Data local (Brasília, UTC−3 fixo desde 2019) de um instante. */
export function localDateOf(d) {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Horários livres em `days` dias a partir de `fromDate` (aaaa-mm-dd), no expediente do perfil, de `slot_minutes`
 * em `slot_minutes`, respeitando a antecedência mínima e o limite de dias. `busy` = intervalos ocupados [início, fim) em ms.
 * Devolve { date, slots: [{ time: 'HH:MM', starts_at: ISO }] } por dia (dias sem expediente ficam de fora).
 */
export function publicSlots(profile, busy, fromDate, days, now = new Date()) {
  const out = [];
  const earliest = now.getTime() + profile.min_notice_hours * 3600_000;
  const lastDay = new Date(Date.parse(`${localDateOf(now)}T12:00:00Z`) + profile.max_days_ahead * 86_400_000).toISOString().slice(0, 10);
  const dur = profile.slot_minutes * 60_000;
  for (let i = 0; i < days; i += 1) {
    const date = new Date(Date.parse(`${fromDate}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    if (date > lastDay) break;
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay() || 7; // 1 = segunda … 7 = domingo
    if (!profile.weekdays.includes(dow)) continue;
    const slots = [];
    for (let m = toMin(profile.day_start); m + profile.slot_minutes <= toMin(profile.day_end); m += profile.slot_minutes) {
      const iso = `${date}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00-03:00`;
      const s = Date.parse(iso);
      if (s < earliest) continue;
      if (busy.some(([b0, b1]) => s < b1 && s + dur > b0)) continue;
      slots.push({ time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, starts_at: new Date(s).toISOString() });
    }
    out.push({ date, slots });
  }
  return out;
}

/** O horário pedido é um dos horários livres? */
export function isOfferedSlot(profile, busy, startsAt, now = new Date()) {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return false;
  const day = publicSlots(profile, busy, localDateOf(d), 1, now)[0];
  return Boolean(day?.slots.some((x) => x.starts_at === d.toISOString()));
}

export function validateBooking(b, profile) {
  const errors = {};
  if (typeof b?.website === 'string' && b.website.trim() !== '') return { spam: true };
  const full_name = typeof b?.full_name === 'string' ? b.full_name.trim().replace(/\s+/g, ' ') : '';
  if (full_name.length < 3 || full_name.length > 120) errors.full_name = 'Informe seu nome completo.';
  const email = typeof b?.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) errors.email = 'E-mail inválido.';
  const phone = normalizePhone(b?.phone);
  if (!phone) errors.phone = 'Telefone com DDD, por exemplo (31) 99999-0000.';
  const mode = b?.mode === 'online' || b?.mode === 'in_person' ? b.mode : null;
  if (!mode || (mode === 'online' && !profile.online) || (mode === 'in_person' && !profile.in_person)) errors.mode = 'Escolha como prefere ser atendido.';
  const message = typeof b?.message === 'string' && b.message.trim() ? b.message.trim() : null;
  if (message && message.length > 500) errors.message = 'Mensagem de até 500 caracteres.';
  if (b?.consent !== true) errors.consent = 'Aceite o uso dos dados para o agendamento.';
  const starts_at = typeof b?.starts_at === 'string' ? b.starts_at : '';
  if (Number.isNaN(Date.parse(starts_at))) errors.starts_at = 'Escolha um horário.';
  if (Object.keys(errors).length) return { errors };
  return { value: { full_name, email, phone, mode, message, starts_at: new Date(starts_at).toISOString() } };
}
