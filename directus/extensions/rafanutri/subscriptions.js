// Assinatura da plataforma por Pix (0059): endpoints do consultório e do admin e o ciclo de renovação.
// Pix direto na chave da Rafanutri; o consultório avisa "já paguei" e o admin confirma. Avisos de cobrança
// pelo Telegram (quem ligou) ou e-mail, pelo mesmo motor dos avisos (notify.js).
import { addDays, annualPeriod, brl, cycleOf, dateBR, monthlyPeriod, newTxid, parsePrice, pixPayload, validateBillingSettings } from './billing.js';
import { buildLinkBody, confirmsInvoice, extractCheckoutUrl, infinitePayClient, paymentRef, sameToken, webhookToken } from './infinitepay.js';

const PAID = ['essential', 'professional', 'clinic'];
const RENEW_DAYS = 7;          // a fatura do mês seguinte sai 7 dias antes do fim do período
const PENDING_DAYS = 15;       // primeira fatura não paga em 15 dias é cancelada

export function setupSubscriptions({ router, database, logger, h, notifier }) {
  const { requireUser, bad, conflict, isUuid, memberOrg, withActor, requireAdmin } = h;
  const SITE = notifier.site;
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d == null ? null : String(d).slice(0, 10));
  const notFound = (res, what = 'Fatura não encontrada.') => res.status(404).json({ errors: [{ message: what, extensions: { code: 'NOT_FOUND' } }] });
  const fail = (res, error, what) => {
    if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
    if (error?.code === '23505') return conflict(res, 'Já existe uma fatura para este período.');
    logger.error({ err: error?.message }, `rafanutri: falha ao ${what}`);
    return res.status(500).json({ errors: [{ message: 'Não foi possível concluir agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
  };
  /** Transação com permissão de escrita na cobrança (gatilho billing_guard) e autor para a auditoria. */
  const billingTx = (user, fn) => {
    const body = async (trx) => {
      await trx.raw("select set_config('rafanutri.billing', 'on', true)");
      return fn(trx);
    };
    return user ? withActor(user, body) : database.transaction(body);   // sem autor: a própria rotina
  };
  const invoiceOut = (i) => i && ({ ...i, period_start: iso(i.period_start), period_end: iso(i.period_end), due_on: iso(i.due_on) });
  const subOut = (s) => s && ({ ...s, current_period_end: iso(s.current_period_end) });
  const INV_FIELDS = ['id', 'plan', 'billing_cycle', 'amount_cents', 'period_start', 'period_end', 'due_on', 'status', 'txid', 'pix_payload', 'checkout_url', 'reported_paid_at', 'paid_at', 'created_at'];
  const planName = async (code, trx = database) => (await trx('plans').where('code', code).first('name'))?.name ?? code;
  const invoiceLink = (id) => `${SITE}/app/configuracoes/plano/fatura/${id}`;

  async function billingConfig(trx = database) {
    const c = await trx('platform_billing').first();
    return c?.pix_key && c?.receiver_name && c?.receiver_city ? c : null;
  }

  /** Cria a fatura (com o código Pix) de um período: mensal, ou anual (12 meses pelo preço anual). */
  async function createInvoice(trx, { orgId, plan, start, due, cfg, cycle = 'monthly' }) {
    const p = await trx('plans').where('code', plan).first('price_cents', 'annual_price_cents', 'name');
    const amount = cycle === 'annual' ? p?.annual_price_cents : p?.price_cents;
    if (!p || !(amount >= 100)) return null;
    const { period_start, period_end } = cycle === 'annual' ? annualPeriod(start) : monthlyPeriod(start);
    const txid = newTxid();
    const payload = pixPayload({ key: cfg.pix_key, name: cfg.receiver_name, city: cfg.receiver_city, amountCents: amount, txid });
    const [row] = await trx('subscription_invoices').insert({ organization_id: orgId, plan, billing_cycle: cycle, amount_cents: amount, period_start, period_end, due_on: due, txid, pix_payload: payload }).returning(INV_FIELDS);
    return invoiceOut(row);
  }

  // ── InfinitePay: link de pagamento por fatura e confirmação automática ────────────────────
  const ip = infinitePayClient({ apiKey: process.env.INFINITEPAY_API_KEY || '' });
  const API = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const IP_TOKEN = webhookToken(process.env.SECRET || '');
  const ipHandle = async () => (await database('platform_billing').first('infinitepay_handle'))?.infinitepay_handle ?? null;

  /** Cria o link da InfinitePay para a fatura e guarda na fatura. Falha não impede o Pix estático. */
  async function attachCheckout(inv) {
    try {
      const handle = await ipHandle();
      if (!handle || !inv) return null;
      const owner = await database('organization_members as m').join('directus_users as u', 'u.id', 'm.user_id')
        .where({ 'm.organization_id': inv.organization_id, 'm.role': 'owner' }).first('u.email', 'u.first_name', 'u.last_name');
      const body = buildLinkBody({
        handle, invoice: inv,
        description: `Rafanutri: plano ${await planName(inv.plan)} ${inv.billing_cycle === 'annual' ? 'anual' : 'mensal'} (${dateBR(inv.period_start)} a ${dateBR(inv.period_end)})`,
        redirectUrl: invoiceLink(inv.id),
        webhookUrl: API && IP_TOKEN ? `${API}/rafanutri/public/billing/infinitepay/${IP_TOKEN}` : null,
        customer: owner ? { name: [owner.first_name, owner.last_name].filter(Boolean).join(' ') || null, email: owner.email } : null,
        withApiKey: ip.withApiKey,
        validUntil: ip.withApiKey ? `${addDays(iso(inv.due_on), 30)}T23:59:59-03:00` : null,
      });
      const r = await ip.createLink(body);
      const url = extractCheckoutUrl(r.json);
      if (!url) {
        logger.warn(`billing: InfinitePay não devolveu link (${r.status}; campos: ${Object.keys(r.json ?? {}).join(',')})`);
        return null;
      }
      await billingTx(SYSTEM, (trx) => trx('subscription_invoices').where({ id: inv.id, status: 'open' }).update({ checkout_url: url, gateway: 'infinitepay' }));
      return url;
    } catch (error) {
      logger.warn(`billing: falha ao criar link da InfinitePay: ${error?.message}`);
      return null;
    }
  }

  /**
   * Confirma a fatura pela InfinitePay: o aviso não tem assinatura, então sempre reconsulta /payment_check e só
   * libera se pago e com o valor da fatura. Mesma rotina da confirmação do admin.
   */
  async function confirmByInfinitePay(ref) {
    if (!ref.order_nsu || !isUuid(ref.order_nsu) || !ref.transaction_nsu || !ref.slug) return { state: 'invalid' };
    const handle = await ipHandle();
    if (!handle) return { state: 'off' };
    const inv = await database('subscription_invoices').where('id', ref.order_nsu).first(INV_FIELDS.concat('organization_id'));
    if (!inv) return { state: 'missing' };
    if (inv.status !== 'open') return { state: inv.status };
    const check = await ip.paymentCheck({ handle, order_nsu: ref.order_nsu, transaction_nsu: ref.transaction_nsu, slug: ref.slug });
    if (!confirmsInvoice(check.json, inv)) return { state: 'unpaid' };
    const out = await billingTx(SYSTEM, (trx) => markPaid(trx, inv.id, { by: null, gatewayId: ref.transaction_nsu }));
    if (out.inv) await notifyConfirmed(out);
    return out.inv ? { state: 'paid', until: out.until } : out;
  }

  const invoiceCtx = async (inv, extra = {}) => ({
    planName: await planName(inv.plan), amount: brl(inv.amount_cents), due: dateBR(inv.due_on),
    period: `${dateBR(inv.period_start)} a ${dateBR(inv.period_end)}`, txid: inv.txid, link: invoiceLink(inv.id), ...extra,
  });

  // ── Consultório ──────────────────────────────────────────────────────────────────────────
  async function ownerOrg(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const m = await memberOrg(user);
    if (!m) { notFound(res, 'Você não tem consultório.'); return null; }
    if (m.role !== 'owner') { res.status(403).json({ errors: [{ message: 'Só o responsável (owner) do consultório cuida da assinatura.', extensions: { code: 'FORBIDDEN' } }] }); return null; }
    return { user, org: m.id, plan: m.plan };
  }

  router.get('/billing', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const m = await memberOrg(user);
    if (!m) return notFound(res, 'Você não tem consultório.');
    const [plans, sub, invoices, cfg] = await Promise.all([
      database('plans').whereIn('code', PAID).where('sellable', true).where('price_cents', '>=', 100).orderBy('price_cents').select('code', 'name', 'price_cents', 'annual_price_cents', 'max_active_patients', 'max_members'),
      database('subscriptions').where('organization_id', m.id).first('plan', 'next_plan', 'billing_cycle', 'next_billing_cycle', 'status', 'current_period_end', 'cancel_at_period_end', 'created_at'),
      database('subscription_invoices').where('organization_id', m.id).orderBy('period_start', 'desc').limit(24).select(INV_FIELDS.filter((f) => f !== 'pix_payload')),
      billingConfig(),
    ]);
    res.json({ data: { current_plan: m.plan, role: m.role, pix_ready: Boolean(cfg), plans, subscription: subOut(sub) ?? null, invoices: invoices.map(invoiceOut) } });
  });

  router.get('/billing/invoices/:id', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const m = await memberOrg(user);
    if (!m || !isUuid(req.params.id)) return notFound(res);
    const inv = await database('subscription_invoices').where({ id: req.params.id, organization_id: m.id }).first(INV_FIELDS);
    if (!inv) return notFound(res);
    const cfg = await database('platform_billing').first('receiver_name');
    res.json({ data: { ...invoiceOut(inv), plan_name: await planName(inv.plan), receiver_name: cfg?.receiver_name ?? null, can_report: m.role === 'owner' } });
  });

  // Assinar (ou trocar de plano). Sem assinatura ativa: fatura na hora, vencendo hoje. Com assinatura ativa:
  // a troca vale a partir da próxima fatura.
  router.post('/billing/subscribe', async (req, res) => {
    const o = await ownerOrg(req, res);
    if (!o) return;
    const plan = req.body?.plan;
    const cycle = cycleOf(req.body?.cycle);
    const p = PAID.includes(plan) ? await database('plans').where({ code: plan, sellable: true }).where('price_cents', '>=', 100).first('code', 'max_active_patients', 'annual_price_cents') : null;
    if (!p) return bad(res, { plan: 'Plano indisponível.' });
    if (cycle === 'annual' && !(p.annual_price_cents >= 100)) return bad(res, { cycle: 'Plano anual indisponível para este plano.' });
    if (p.max_active_patients != null) {
      // Plano menor que o uso atual: o consultório ficaria sem poder ativar pacientes. Pede para arquivar antes.
      const active = await database('patients').where({ organization_id: o.org, status: 'active' }).count('* as n').first();
      if (Number(active?.n ?? 0) > p.max_active_patients) return conflict(res, `Este plano vai até ${p.max_active_patients} pacientes ativos e o consultório tem ${active.n}. Arquive pacientes ou escolha um plano maior.`);
    }
    const cfg = await billingConfig();
    if (!cfg) return res.status(503).json({ errors: [{ message: 'O pagamento por Pix ainda não foi configurado. Tente de novo em breve.', extensions: { code: 'BILLING_OFF' } }] });
    try {
      const out = await billingTx(o.user, async (trx) => {
        const sub = await trx('subscriptions').where('organization_id', o.org).forUpdate().first();
        if (sub?.status === 'active') {
          // Assinatura ativa: troca de plano e/ou de ciclo vale a partir da próxima fatura
          const changes = plan !== sub.plan || cycle !== sub.billing_cycle;
          await trx('subscriptions').where('organization_id', o.org).update({
            next_plan: plan === sub.plan ? null : plan, next_billing_cycle: cycle === sub.billing_cycle ? null : cycle, cancel_at_period_end: false,
          });
          return { scheduled: changes, from: iso(sub.current_period_end) };
        }
        if (sub) await trx('subscriptions').where('organization_id', o.org).update({ plan, billing_cycle: cycle, next_plan: null, next_billing_cycle: null, status: 'pending', cancel_at_period_end: false });
        else await trx('subscriptions').insert({ organization_id: o.org, plan, billing_cycle: cycle, status: 'pending', user_created: o.user });
        await trx('subscription_invoices').where({ organization_id: o.org, status: 'open' }).update({ status: 'void' });
        const inv = await createInvoice(trx, { orgId: o.org, plan, start: today(), due: today(), cfg, cycle });
        return { invoice: inv };
      });
      if (out.invoice) {
        await attachCheckout({ ...out.invoice, organization_id: o.org });
        await notifier.notifyOwners({ orgId: o.org, kind: 'invoice_created', dedupe: `inv:${out.invoice.id}`, ctx: await invoiceCtx(out.invoice) });
        notifier.tick();
      }
      res.status(201).json({ data: out });
    } catch (error) {
      fail(res, error, 'assinar');
    }
  });

  router.post('/billing/invoices/:id/reported', async (req, res) => {
    const o = await ownerOrg(req, res);
    if (!o) return;
    const inv = isUuid(req.params.id) ? await database('subscription_invoices').where({ id: req.params.id, organization_id: o.org }).first(INV_FIELDS) : null;
    if (!inv) return notFound(res);
    if (inv.status !== 'open') return conflict(res, inv.status === 'paid' ? 'Esta fatura já está paga.' : 'Esta fatura foi cancelada.');
    try {
      if (!inv.reported_paid_at) {
        await billingTx(o.user, (trx) => trx('subscription_invoices').where('id', inv.id).update({ reported_paid_at: trx.fn.now() }));
        const cfg = await database('platform_billing').first('notify_email');
        await notifier.notifyAdmins({ orgId: o.org, kind: 'payment_reported', dedupe: `inv-rep:${inv.id}`, ctx: await invoiceCtx(invoiceOut(inv), { link: `${SITE}/app/admin/assinaturas` }), extraEmail: cfg?.notify_email ?? null });
        notifier.tick();
      }
      res.json({ data: { ok: true } });
    } catch (error) {
      fail(res, error, 'informar pagamento');
    }
  });

  // Cancelar: assinatura ativa fica até o fim do período; pendente é cancelada na hora.
  router.post('/billing/cancel', async (req, res) => {
    const o = await ownerOrg(req, res);
    if (!o) return;
    try {
      const out = await billingTx(o.user, async (trx) => {
        const sub = await trx('subscriptions').where('organization_id', o.org).forUpdate().first();
        if (!sub || ['canceled', 'ended'].includes(sub.status)) return { none: true };
        if (sub.status === 'pending') {
          await trx('subscriptions').where('organization_id', o.org).update({ status: 'canceled' });
          await trx('subscription_invoices').where({ organization_id: o.org, status: 'open' }).update({ status: 'void' });
          return { canceled: true };
        }
        await trx('subscriptions').where('organization_id', o.org).update({ cancel_at_period_end: true, next_plan: null });
        await trx('subscription_invoices').where({ organization_id: o.org, status: 'open' }).where('period_start', '>', sub.current_period_end).update({ status: 'void' });
        return { until: iso(sub.current_period_end) };
      });
      if (out.none) return conflict(res, 'Não há assinatura para cancelar.');
      res.json({ data: out });
    } catch (error) {
      fail(res, error, 'cancelar assinatura');
    }
  });

  router.post('/billing/resume', async (req, res) => {
    const o = await ownerOrg(req, res);
    if (!o) return;
    try {
      const n = await billingTx(o.user, (trx) => trx('subscriptions').where({ organization_id: o.org, status: 'active', cancel_at_period_end: true }).update({ cancel_at_period_end: false }));
      if (!n) return conflict(res, 'Não há cancelamento agendado.');
      notifier.tick();
      res.json({ data: { ok: true } });
    } catch (error) {
      fail(res, error, 'retomar assinatura');
    }
  });

  // ── Admin da plataforma ──────────────────────────────────────────────────────────────────
  router.get('/admin/billing', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const [cfg, plans, invoices, subs] = await Promise.all([
      database('platform_billing').first('pix_key', 'receiver_name', 'receiver_city', 'notify_email', 'grace_days', 'infinitepay_handle', 'updated_at'),
      database('plans').whereIn('code', PAID).orderBy('price_cents').select('code', 'name', 'price_cents', 'annual_price_cents', 'sellable', 'max_active_patients', 'max_members'),
      database('subscription_invoices as i').join('organizations as o', 'o.id', 'i.organization_id')
        .where('i.status', 'open').orWhere((q) => q.where('i.status', 'paid').whereRaw("i.paid_at > now() - interval '30 days'"))
        .orderByRaw('i.reported_paid_at is null, i.status desc, i.due_on').limit(200)
        .select('i.id', 'i.organization_id', 'o.name as organization_name', 'i.plan', 'i.amount_cents', 'i.period_start', 'i.period_end', 'i.due_on', 'i.status', 'i.txid', 'i.reported_paid_at', 'i.paid_at',
          database.raw("(select u.email from organization_members m join directus_users u on u.id = m.user_id where m.organization_id = i.organization_id and m.role = 'owner' limit 1) as owner_email")),
      database('subscriptions as s').join('organizations as o', 'o.id', 's.organization_id').orderBy('s.updated_at', 'desc').limit(200)
        .select('s.organization_id', 'o.name as organization_name', 's.plan', 's.next_plan', 's.billing_cycle', 's.next_billing_cycle', 's.status', 's.current_period_end', 's.cancel_at_period_end'),
    ]);
    res.json({ data: { settings: cfg, plans, invoices: invoices.map(invoiceOut), subscriptions: subs.map(subOut) } });
  });

  router.put('/admin/billing/settings', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const v = validateBillingSettings(req.body);
    if (v.errors) return bad(res, v.errors);
    await database('platform_billing').update({ ...v.value, updated_by: user, updated_at: database.fn.now() });
    res.json({ data: v.value });
  });

  router.put('/admin/billing/plans/:code', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    if (!PAID.includes(req.params.code)) return notFound(res, 'Plano não encontrado.');
    const price = parsePrice(req.body?.price);
    const sellable = req.body?.sellable === true;
    if (price === null) return bad(res, { price: 'Preço inválido.' });
    if (sellable && price < 100) return bad(res, { price: 'Para vender, o preço precisa ser de pelo menos R$ 1,00.' });
    // Anual: o informado, ou 12 meses com 50% de desconto (6 mensalidades)
    const annual = req.body?.annual_price !== undefined && req.body?.annual_price !== '' ? parsePrice(req.body.annual_price) : price * 6;
    if (annual === null || (price >= 100 && annual < 100)) return bad(res, { annual_price: 'Preço anual inválido.' });
    await database('plans').where('code', req.params.code).update({ price_cents: price, annual_price_cents: price >= 100 ? annual : null, sellable });
    res.json({ data: { code: req.params.code, price_cents: price, annual_price_cents: price >= 100 ? annual : null, sellable } });
  });

  /** Fatura paga, assinatura ativa até o fim do período da fatura e plano liberado (admin ou InfinitePay). */
  async function markPaid(trx, invoiceId, { by = null, paidAt = null, gatewayId = null } = {}) {
    const inv = await trx('subscription_invoices').where('id', invoiceId).forUpdate().first(INV_FIELDS.concat('organization_id'));
    if (!inv) return { missing: true };
    if (inv.status !== 'open') return { state: inv.status };
    await trx('subscription_invoices').where('id', inv.id).update({ status: 'paid', paid_at: paidAt ?? trx.fn.now(), confirmed_by: by, ...(gatewayId ? { gateway: 'infinitepay', gateway_id: gatewayId } : {}) });
    const sub = await trx('subscriptions').where('organization_id', inv.organization_id).forUpdate().first();
    const end = iso(inv.period_end);
    const until = sub?.current_period_end && iso(sub.current_period_end) > end ? iso(sub.current_period_end) : end;
    const patch = {
      status: 'active', plan: inv.plan, billing_cycle: inv.billing_cycle, current_period_end: until,
      next_plan: sub?.next_plan === inv.plan ? null : sub?.next_plan ?? null,
      next_billing_cycle: sub?.next_billing_cycle === inv.billing_cycle ? null : sub?.next_billing_cycle ?? null,
    };
    if (sub) await trx('subscriptions').where('organization_id', inv.organization_id).update(patch);
    else await trx('subscriptions').insert({ organization_id: inv.organization_id, ...patch });
    await trx('organizations').where('id', inv.organization_id).update({ plan: inv.plan });
    return { inv: invoiceOut(inv), until };
  }

  async function notifyConfirmed(out) {
    await notifier.notifyOwners({ orgId: out.inv.organization_id, kind: 'payment_confirmed', dedupe: `inv-ok:${out.inv.id}`, ctx: await invoiceCtx(out.inv, { until: dateBR(out.until), link: `${SITE}/app/configuracoes/plano` }) });
    notifier.tick();
  }

  // Aviso da InfinitePay (sem login): responde logo e confere o pagamento por /payment_check.
  router.post('/public/billing/infinitepay/:token', async (req, res) => {
    if (!IP_TOKEN || !sameToken(req.params.token, IP_TOKEN)) return res.status(404).json({ errors: [{ message: 'Não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const ref = paymentRef(req.body);
    res.json({ data: { ok: true } });
    confirmByInfinitePay(ref).then((r) => {
      if (r.state !== 'paid' && r.state !== 'paid_already') logger.info(`billing: aviso da InfinitePay sem confirmação (${r.state})`);
    }).catch((error) => logger.error(`billing: falha ao conferir aviso da InfinitePay: ${error?.message}`));
  });

  // Volta do pagamento (redirect_url): confere na hora, sem esperar o aviso.
  router.post('/billing/invoices/:id/check', async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const m = await memberOrg(user);
    if (!m || !isUuid(req.params.id)) return notFound(res);
    const own = await database('subscription_invoices').where({ id: req.params.id, organization_id: m.id }).first('id', 'status');
    if (!own) return notFound(res);
    if (own.status !== 'open') return res.json({ data: { status: own.status } });
    try {
      const r = await confirmByInfinitePay({ ...paymentRef(req.body), order_nsu: own.id });
      res.json({ data: { status: r.state === 'paid' ? 'paid' : own.status, result: r.state, until: r.until ?? null } });
    } catch (error) {
      logger.error(`billing: falha ao conferir pagamento: ${error?.message}`);
      res.status(503).json({ errors: [{ message: 'Não foi possível conferir o pagamento agora. Ele será confirmado pelo aviso da InfinitePay.', extensions: { code: 'GATEWAY_UNAVAILABLE' } }] });
    }
  });

  // Confirmar pagamento: fatura paga, assinatura ativa até o fim do período da fatura, plano liberado.
  router.post('/admin/billing/invoices/:id/confirm', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    if (!isUuid(req.params.id)) return notFound(res);
    const paidOn = typeof req.body?.paid_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.paid_on) ? `${req.body.paid_on}T12:00:00-03:00` : null;
    try {
      const out = await billingTx(user, (trx) => markPaid(trx, req.params.id, { by: user, paidAt: paidOn }));
      if (out.missing) return notFound(res);
      if (out.state) return conflict(res, out.state === 'paid' ? 'Esta fatura já foi confirmada.' : 'Esta fatura foi cancelada.');
      await notifyConfirmed(out);
      res.json({ data: { ok: true, until: out.until } });
    } catch (error) {
      fail(res, error, 'confirmar pagamento');
    }
  });

  router.post('/admin/billing/invoices/:id/void', async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    if (!isUuid(req.params.id)) return notFound(res);
    try {
      const n = await billingTx(user, (trx) => trx('subscription_invoices').where({ id: req.params.id, status: 'open' }).update({ status: 'void' }));
      if (!n) return conflict(res, 'Só fatura em aberto pode ser cancelada.');
      res.json({ data: { ok: true } });
    } catch (error) {
      fail(res, error, 'cancelar fatura');
    }
  });

  // ── Ciclo (a cada minuto, junto com os avisos) ───────────────────────────────────────────
  const SYSTEM = null;
  async function cycle() {
    const t = today();
    const cfg = await billingConfig();
    const grace = (await database('platform_billing').first('grace_days'))?.grace_days ?? 7;

    // 1) Renovação: fatura do período seguinte, 7 dias antes do fim.
    if (cfg) {
      const due = await database('subscriptions').where({ status: 'active', cancel_at_period_end: false })
        .whereRaw('current_period_end - ?::int <= ?::date', [RENEW_DAYS, t]).select('organization_id', 'plan', 'next_plan', 'billing_cycle', 'next_billing_cycle', 'current_period_end');
      for (const s of due) {
        const start = addDays(iso(s.current_period_end), 1);
        const exists = await database('subscription_invoices').where({ organization_id: s.organization_id, period_start: start }).whereNot('status', 'void').first('id');
        if (exists) continue;
        const inv = await billingTx(SYSTEM, (trx) => createInvoice(trx, { orgId: s.organization_id, plan: s.next_plan ?? s.plan, start, due: iso(s.current_period_end), cfg, cycle: s.next_billing_cycle ?? s.billing_cycle })).catch((error) => {
          if (error?.code !== '23505') logger.error({ err: error?.message }, 'rafanutri: falha ao gerar fatura de renovação');
          return null;
        });
        if (inv) await attachCheckout({ ...inv, organization_id: s.organization_id });
        if (inv) await notifier.notifyOwners({ orgId: s.organization_id, kind: 'invoice_created', dedupe: `inv:${inv.id}`, ctx: await invoiceCtx(inv) });
      }
    }

    // 2) Lembretes: no dia do vencimento e 3 dias depois (sem "já paguei").
    const open = await database('subscription_invoices').where('status', 'open').whereNull('reported_paid_at')
      .whereIn('due_on', [t, addDays(t, -3)]).select(INV_FIELDS.concat('organization_id'));
    for (const inv of open.map(invoiceOut)) {
      const late = inv.due_on !== t;
      await notifier.notifyOwners({ orgId: inv.organization_id, kind: 'invoice_due', dedupe: `inv-${late ? 'late' : 'due'}:${inv.id}`, ctx: await invoiceCtx(inv, { late, cutoff: dateBR(addDays(inv.due_on, grace + 1)) }) });
    }

    // 3) Fim: cancelada no fim do período, ou sem pagamento depois da carência → volta ao Gratuito.
    const ending = await database('subscriptions').where('status', 'active').where((q) => q
      .where((a) => a.where('cancel_at_period_end', true).whereRaw('current_period_end < ?::date', [t]))
      .orWhereRaw('current_period_end + ?::int < ?::date', [grace, t])).select('organization_id', 'plan', 'cancel_at_period_end');
    for (const s of ending) {
      await billingTx(SYSTEM, async (trx) => {
        await trx('subscriptions').where('organization_id', s.organization_id).update({ status: s.cancel_at_period_end ? 'canceled' : 'ended', next_plan: null });
        await trx('subscription_invoices').where({ organization_id: s.organization_id, status: 'open' }).update({ status: 'void' });
        await trx('organizations').where('id', s.organization_id).update({ plan: 'free' });
      });
      await notifier.notifyOwners({ orgId: s.organization_id, kind: 'subscription_ended', dedupe: `sub-end:${s.organization_id}:${t}`, ctx: { planName: await planName(s.plan), link: `${SITE}/app/configuracoes/plano` } });
    }

    // 4) Primeira fatura esquecida: cancela depois de 15 dias.
    const stale = await database('subscriptions as s').join('subscription_invoices as i', 'i.organization_id', 's.organization_id')
      .where({ 's.status': 'pending', 'i.status': 'open' }).whereRaw('i.due_on < ?::date', [addDays(t, -PENDING_DAYS)]).distinct('s.organization_id');
    for (const s of stale) {
      await billingTx(SYSTEM, async (trx) => {
        await trx('subscriptions').where({ organization_id: s.organization_id, status: 'pending' }).update({ status: 'canceled' });
        await trx('subscription_invoices').where({ organization_id: s.organization_id, status: 'open' }).update({ status: 'void' });
      });
    }
  }
  notifier.addCycle(cycle);
}
