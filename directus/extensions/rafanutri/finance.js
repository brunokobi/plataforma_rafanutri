// RN-053 — Regras puras do financeiro (validação antes do banco, que repete as regras).

export const PAYMENT_METHODS = ['pix', 'cash', 'debit', 'credit', 'transfer', 'boleto', 'other'];
export const MAX_AMOUNT_CENTS = 10_000_000_000; // R$ 100 milhões
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isIsoDate(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** Valida um lançamento. Devolve { value } ou { errors }. */
export function validateTransaction(b) {
  const errors = {};
  const kind = b?.kind === 'income' || b?.kind === 'expense' ? b.kind : null;
  if (!kind) errors.kind = 'Escolha receita ou despesa.';
  const category_id = typeof b?.category_id === 'string' && UUID.test(b.category_id) ? b.category_id : null;
  if (!category_id) errors.category_id = 'Escolha a categoria.';
  const description = typeof b?.description === 'string' ? b.description.trim().replace(/\s+/g, ' ') : '';
  if (description.length < 2 || description.length > 200) errors.description = 'Descrição de 2 a 200 caracteres.';
  const amount = Number(b?.amount_cents);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT_CENTS) errors.amount_cents = 'Valor maior que zero.';
  const due_date = isIsoDate(b?.due_date) ? b.due_date : null;
  if (!due_date) errors.due_date = 'Data de vencimento inválida.';
  const status = ['open', 'paid', 'cancelled'].includes(b?.status) ? b.status : 'open';
  let paid_at = null;
  if (status === 'paid') {
    paid_at = b?.paid_at == null || b.paid_at === '' ? due_date : isIsoDate(b.paid_at) ? b.paid_at : undefined;
    if (paid_at === undefined) errors.paid_at = 'Data de pagamento inválida.';
  }
  const payment_method = b?.payment_method == null || b.payment_method === '' ? null : PAYMENT_METHODS.includes(b.payment_method) ? b.payment_method : undefined;
  if (payment_method === undefined) errors.payment_method = 'Forma de pagamento inválida.';
  const optUuid = (v, key, label) => {
    if (v == null || v === '') return null;
    if (typeof v === 'string' && UUID.test(v)) return v;
    errors[key] = label;
    return null;
  };
  const patient_id = kind === 'income' ? optUuid(b?.patient_id, 'patient_id', 'Paciente inválido.') : null;
  const appointment_id = kind === 'income' ? optUuid(b?.appointment_id, 'appointment_id', 'Consulta inválida.') : null;
  const notes = typeof b?.notes === 'string' && b.notes.trim() ? b.notes.trim() : null;
  if (notes && notes.length > 500) errors.notes = 'Observação de até 500 caracteres.';
  if (Object.keys(errors).length) return { errors };
  return { value: { kind, category_id, description, amount_cents: amount, due_date, status, paid_at, payment_method, patient_id, appointment_id, notes } };
}

/** Primeiro dia do mês (aaaa-mm-01) `offset` meses a partir de `ym` (aaaa-mm). */
export function monthStart(ym, offset = 0) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 10);
}

/** Últimos `n` meses terminando em `ym`, com zero onde não houve movimento. */
export function fillMonths(rows, ym, n = 6) {
  const by = new Map(rows.map((r) => [String(r.month).slice(0, 10), r]));
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const month = monthStart(ym, -i);
    const r = by.get(month);
    out.push({ month, income_cents: Number(r?.income_cents ?? 0), expense_cents: Number(r?.expense_cents ?? 0) });
  }
  return out;
}

/**
 * RN-054 — Parcelas da venda de pacote: divide em `n` parcelas mensais a partir de `firstDue` (aaaa-mm-dd).
 * Centavos que sobram vão na primeira; dia 31 vira o último dia dos meses mais curtos.
 */
export function splitInstallments(totalCents, n, firstDue) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || !Number.isInteger(n) || n < 1 || n > 12 || !isIsoDate(firstDue)) return null;
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  const [y, m, d] = firstDue.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const last = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
    const due = new Date(Date.UTC(y, m - 1 + i, Math.min(d, last))).toISOString().slice(0, 10);
    out.push({ number: i + 1, amount_cents: base + (i === 0 ? rest : 0), due_date: due });
  }
  return out;
}

/** Valida o pacote do catálogo. */
export function validatePackage(b) {
  const errors = {};
  const name = typeof b?.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 80) errors.name = 'Nome de 2 a 80 caracteres.';
  const sessions = Number(b?.sessions);
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 100) errors.sessions = 'De 1 a 100 sessões.';
  const price = Number(b?.price_cents);
  if (!Number.isSafeInteger(price) || price <= 0 || price > MAX_AMOUNT_CENTS) errors.price_cents = 'Preço maior que zero.';
  let validity = b?.validity_days == null || b.validity_days === '' ? null : Number(b.validity_days);
  if (validity !== null && (!Number.isInteger(validity) || validity < 1 || validity > 730)) errors.validity_days = 'Validade de 1 a 730 dias.';
  if (Object.keys(errors).length) return { errors };
  return { value: { name, sessions, price_cents: price, validity_days: validity, active: b?.active !== false } };
}
