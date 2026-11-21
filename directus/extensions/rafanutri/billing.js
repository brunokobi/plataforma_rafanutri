// Assinatura da plataforma por Pix (0059): regras puras — código Pix (BR Code), chave, períodos e valores.
import { randomBytes } from 'node:crypto';

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o padrão EMV do Pix. */
export function crc16(text) {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const field = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** Tira acentos e caracteres fora do padrão (nome e cidade do recebedor). */
export const asciiUpper = (s, max) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .&-]/g, '').trim().toUpperCase().slice(0, max);

/**
 * Código Pix "copia e cola" estático com valor (BR Code). amountCents: inteiro; txid: até 25 letras/números.
 * Valor e identificador viajam no código; o banco do pagador mostra nome e valor para conferir.
 */
export function pixPayload({ key, name, city, amountCents, txid, description = null }) {
  const account = field('00', 'br.gov.bcb.pix') + field('01', key) + (description ? field('02', description.slice(0, 40)) : '');
  const body = field('00', '01')
    + field('26', account)
    + field('52', '0000')
    + field('53', '986')
    + (amountCents != null ? field('54', (amountCents / 100).toFixed(2)) : '')
    + field('58', 'BR')
    + field('59', asciiUpper(name, 25))
    + field('60', asciiUpper(city, 15))
    + field('62', field('05', txid ?? '***'))
    + '6304';
  return body + crc16(body);
}

/** Identificador da fatura: "RN" + 20 letras/números (cabe nos 25 do Pix). */
export const newTxid = () => `RN${randomBytes(15).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 20).padEnd(20, '0')}`;

/** Normaliza e valida a chave Pix. Devolve { key, type } ou null. */
export function normalizePixKey(raw) {
  const s = String(raw ?? '').trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { key: s.toLowerCase(), type: 'evp' };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 77) return { key: s.toLowerCase(), type: 'email' };
  const digits = s.replace(/\D/g, '');
  if (/^\+/.test(s) || /^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/.test(s) && digits.length >= 10 && digits.length <= 11) {
    const full = digits.length <= 11 ? `55${digits}` : digits;
    return /^55\d{10,11}$/.test(full) ? { key: `+${full}`, type: 'phone' } : null;
  }
  if (digits.length === 11 && validCpf(digits)) return { key: digits, type: 'cpf' };
  if (digits.length === 14 && validCnpj(digits)) return { key: digits, type: 'cnpj' };
  return null;
}

function validCpf(d) {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i += 1) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
function validCnpj(d) {
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (n) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * Number(d[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Soma meses a uma data AAAA-MM-DD, segurando no último dia do mês (31/01 + 1 = 28 ou 29/02). */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
export const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Período de uma fatura mensal que começa em `start`: termina no dia anterior ao mesmo dia do mês seguinte. */
export const monthlyPeriod = (start) => ({ period_start: start, period_end: addDays(addMonths(start, 1), -1) });

/** "R$ 49,90". */
export const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "25/11/2026". */
export const dateBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** Configuração de cobrança do admin. Devolve { value } ou { errors }. */
export function validateBillingSettings(b) {
  const errors = {};
  const key = normalizePixKey(b?.pix_key);
  if (!key) errors.pix_key = 'Chave Pix inválida (CPF, CNPJ, e-mail, celular ou chave aleatória).';
  const name = asciiUpper(b?.receiver_name, 25);
  if (name.length < 3) errors.receiver_name = 'Nome do recebedor (até 25 letras, sem acento).';
  const city = asciiUpper(b?.receiver_city, 15).replace(/[^A-Z .-]/g, '');
  if (city.length < 2) errors.receiver_city = 'Cidade do recebedor (até 15 letras).';
  const email = typeof b?.notify_email === 'string' && b.notify_email.trim() ? b.notify_email.trim().toLowerCase() : null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.notify_email = 'E-mail inválido.';
  const grace = Number(b?.grace_days ?? 7);
  if (!Number.isInteger(grace) || grace < 0 || grace > 30) errors.grace_days = 'Carência de 0 a 30 dias.';
  if (Object.keys(errors).length) return { errors };
  return { value: { pix_key: key.key, receiver_name: name, receiver_city: city, notify_email: email, grace_days: grace } };
}

/** Preço do plano digitado pelo admin ("49,90" ou 4990 centavos). */
export function parsePrice(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v >= 0 && v <= 100000000 ? v : null;
  const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  return c <= 100000000 ? c : null;
}
