// InfinitePay — Checkout Integrado (https://www.infinitepay.io/checkout-documentacao), para a assinatura da plataforma.
// Conta de pessoa física, sem mensalidade, Pix grátis. Não há sandbox nem assinatura no webhook: todo aviso é
// confirmado por POST /payment_check antes de liberar o plano. Regras puras aqui; a chamada de rede recebe o fetch.
import { createHash, timingSafeEqual } from 'node:crypto';

export const API_BASE = 'https://api.checkout.infinitepay.io';

/** InfiniteTag sem o "$" (letras, números, ponto, hífen e sublinhado). Devolve null se inválida. */
export function normalizeHandle(v) {
  if (typeof v !== 'string') return null;
  const h = v.trim().replace(/^\$/, '').toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{1,39}$/.test(h) ? h : null;
}

/** Segredo do caminho do webhook, derivado do SECRET do Directus (o aviso não tem assinatura). */
export const webhookToken = (secret) => (secret ? createHash('sha256').update(`rafanutri-infinitepay:${secret}`).digest('hex').slice(0, 48) : '');

/** Comparação em tempo constante do token do webhook. */
export function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Corpo de POST /links para uma fatura: valor em centavos, order_nsu = id da fatura (volta no webhook e na
 * redirect_url), cliente opcional. Com API Key: pagamento único e link válido até a data informada.
 */
export function buildLinkBody({ handle, invoice, description, redirectUrl, webhookUrl, customer, withApiKey = false, validUntil = null }) {
  const body = {
    handle,
    items: [{ quantity: 1, price: invoice.amount_cents, description: String(description).slice(0, 120) }],
    order_nsu: invoice.id,
    redirect_url: redirectUrl,
  };
  if (webhookUrl) body.webhook_url = webhookUrl;
  if (customer?.email || customer?.name) body.customer = { ...(customer.name ? { name: customer.name } : {}), ...(customer.email ? { email: customer.email } : {}) };
  if (withApiKey) body.options = { single_payment: true, ...(validUntil ? { valid_until: validUntil } : {}) };
  return body;
}

/** URL do checkout na resposta de POST /links (a documentação não nomeia o campo: procura a primeira URL https). */
export function extractCheckoutUrl(json) {
  if (!json || typeof json !== 'object') return null;
  for (const k of ['url', 'link', 'checkout_url', 'payment_url']) {
    if (typeof json[k] === 'string' && /^https:\/\//.test(json[k])) return json[k];
  }
  for (const v of Object.values(json)) {
    if (typeof v === 'string' && /^https:\/\/\S+$/.test(v)) return v;
    if (v && typeof v === 'object') {
      const inner = extractCheckoutUrl(v);
      if (inner) return inner;
    }
  }
  return null;
}

/** Dados do aviso (webhook) ou da volta (redirect_url) necessários para conferir o pagamento. */
export function paymentRef(src) {
  const s = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  return { order_nsu: s(src?.order_nsu), transaction_nsu: s(src?.transaction_nsu), slug: s(src?.invoice_slug ?? src?.slug) };
}

/**
 * Resposta de /payment_check confirma a fatura? Pago, com sucesso e o valor original igual ao da fatura
 * (paid_amount pode ser maior quando o cliente parcela com juros; não se exige igualdade dele).
 */
export function confirmsInvoice(check, invoice) {
  return Boolean(check && check.success === true && check.paid === true && Number(check.amount) === Number(invoice.amount_cents));
}

/** Chamadas de rede (fetch injetado, para testar sem rede). */
export function infinitePayClient({ fetchImpl = fetch, apiKey = '' } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(apiKey ? { 'X-Api-Key': apiKey } : {}) };
  async function post(path, body) {
    const res = await fetchImpl(`${API_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }
  return {
    withApiKey: Boolean(apiKey),
    createLink: (body) => post('/links', body),
    paymentCheck: ({ handle, order_nsu, transaction_nsu, slug }) => post('/payment_check', { handle, order_nsu, transaction_nsu, slug }),
  };
}
