// RN-056 — Regras puras do CRM (validação antes do banco, que repete as regras).

export const LEAD_SOURCES = ['instagram', 'referral', 'google', 'site', 'whatsapp', 'other'];

/** Telefone brasileiro em E.164: "(31) 99999-0000" → "+5531999990000"; já com + fica como está. null se vazio; undefined se inválido. */
export function normalizePhone(v) {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim();
  const digits = s.replace(/\D/g, '');
  const e164 = s.startsWith('+') ? `+${digits}` : digits.length === 10 || digits.length === 11 ? `+55${digits}` : digits.length >= 12 && digits.startsWith('55') ? `+${digits}` : null;
  return e164 && /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : undefined;
}

export function validateLead(b) {
  const errors = {};
  const full_name = typeof b?.full_name === 'string' ? b.full_name.trim().replace(/\s+/g, ' ') : '';
  if (full_name.length < 2 || full_name.length > 120) errors.full_name = 'Nome de 2 a 120 caracteres.';
  const phone = normalizePhone(b?.phone);
  if (phone === undefined) errors.phone = 'Telefone com DDD, por exemplo (31) 99999-0000.';
  const email = typeof b?.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase() : null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'E-mail inválido.';
  const source = LEAD_SOURCES.includes(b?.source) ? b.source : 'other';
  const notes = typeof b?.notes === 'string' && b.notes.trim() ? b.notes.trim() : null;
  if (notes && notes.length > 500) errors.notes = 'Observação de até 500 caracteres.';
  if (Object.keys(errors).length) return { errors };
  return { value: { full_name, phone: phone ?? null, email, source, notes } };
}
