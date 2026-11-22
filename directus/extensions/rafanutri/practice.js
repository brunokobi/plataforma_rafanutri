// Módulo Gestão do consultório: financeiro, recibos, pacotes de consultas, CRM, indicadores e página pública com
// agendamento online. Saiu de index.js (mesma ordem das rotas). O bloqueio por plano fica em index.js (PRACTICE_ROUTES).
import { isOfferedSlot, localDateOf, publicSlots, validateBooking } from './booking.js';
import { validateLead } from './crm.js';
import { fillMonths, isIsoDate, monthStart, splitInstallments, validatePackage, validateTransaction } from './finance.js';

export function setupPractice(ctx) {
  const { bad, conflict, database, getSchema, hasPractice, isUuid, logAccess, logger, memberOrg, orgNotFound, ownedOrg, requireUser, router, services } = ctx;
    // ── Financeiro (RN-053) ─────────────────────────────────────────────────────────────────────
    // Qualquer membro do consultório lança e edita; excluir só owner/nutricionista (o banco confere
    // pela variável rafanutri.actor). Valores sempre em centavos.
    const finNotFound = (res) => res.status(404).json({ errors: [{ message: 'Lançamento não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const todaySP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const finDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d == null ? null : String(d).slice(0, 10));
    const TX_FIELDS = ['t.id', 't.kind', 't.category_id', 'c.name as category_name', 't.description', 't.amount_cents', database.raw('t.due_date::text as due_date'), 't.status', database.raw('t.paid_at::text as paid_at'),
      't.payment_method', 't.patient_id', 'p.full_name as patient_name', 't.appointment_id', 't.notes', 't.date_created',
      database.raw('(select r.id from receipts r where r.transaction_id = t.id) as receipt_id')];
    const txOut = (r) => ({ ...r, amount_cents: Number(r.amount_cents), due_date: finDate(r.due_date), paid_at: finDate(r.paid_at) });
    const finConflict = (res, error) => {
      if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
      if (error?.code === '23505') return conflict(res, 'Esta consulta já tem um recebimento registrado.');
      if (error?.code === '23503') return conflict(res, 'Este lançamento tem recibo emitido: cancele em vez de excluir.');
      logger.error({ err: error }, 'rafanutri: falha no financeiro');
      return res.status(500).json({ errors: [{ message: 'Não foi possível salvar o lançamento agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    };
    async function finMember(req, res) {
      const user = requireUser(req, res);
      if (!user) return null;
      const m = await memberOrg(user);
      if (!m) {
        res.status(403).json({ errors: [{ message: 'Você não tem consultório.', extensions: { code: 'FORBIDDEN' } }] });
        return null;
      }
      return { user, org: m.id, role: m.role };
    }
    const txQuery = (org) => database('financial_transactions as t')
      .join('financial_categories as c', 'c.id', 't.category_id')
      .leftJoin('patients as p', 'p.id', 't.patient_id')
      .where('t.organization_id', org);

    router.get('/finance/categories', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const rows = await database('financial_categories').where((q) => q.whereNull('organization_id').orWhere('organization_id', m.org)).where('archived', false)
        .orderBy([{ column: 'kind' }, { column: 'name' }]).select('id', 'kind', 'name', database.raw('(organization_id is not null) as own'));
      res.json({ data: rows });
    });

    router.post('/finance/categories', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const kind = req.body?.kind === 'income' || req.body?.kind === 'expense' ? req.body.kind : null;
      const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
      if (!kind || name.length < 2 || name.length > 40) return bad(res, { name: 'Nome de 2 a 40 caracteres e tipo (receita ou despesa).' });
      try {
        const [row] = await database('financial_categories').insert({ organization_id: m.org, kind, name, user_created: m.user }).returning(['id', 'kind', 'name']);
        res.status(201).json({ data: { ...row, own: true } });
      } catch (error) {
        if (error?.code === '23505') return conflict(res, 'Já existe uma categoria com esse nome.');
        finConflict(res, error);
      }
    });

    // Lista por vencimento no período (padrão: mês atual). ?from=aaaa-mm-dd&to=aaaa-mm-dd&kind=&status=
    router.get('/finance/transactions', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const today = todaySP();
      const from = isIsoDate(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`;
      const to = isIsoDate(req.query.to) ? req.query.to : monthStart(today.slice(0, 7), 1);
      let q = txQuery(m.org).where('t.due_date', '>=', from).where('t.due_date', '<', to);
      if (req.query.kind === 'income' || req.query.kind === 'expense') q = q.where('t.kind', req.query.kind);
      if (['open', 'paid', 'cancelled'].includes(req.query.status)) q = q.where('t.status', req.query.status);
      if (isUuid(req.query.patient)) q = q.where('t.patient_id', req.query.patient);
      const rows = await q.orderBy([{ column: 't.due_date', order: 'asc' }, { column: 't.date_created', order: 'asc' }]).limit(2000).select(TX_FIELDS);
      res.json({ data: { from, to, today, transactions: rows.map(txOut), can_delete: m.role !== 'assistant' } });
    });

    // Resumo: 6 meses de caixa (pagos, pelo mês do pagamento) e contas a receber em aberto (atrasadas à parte).
    router.get('/finance/summary', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const today = todaySP();
      const ym = /^\d{4}-\d{2}$/.test(req.query.month ?? '') ? req.query.month : today.slice(0, 7);
      const rows = await database('monthly_cash_flow').where('organization_id', m.org)
        .where('month', '>=', monthStart(ym, -5)).where('month', '<', monthStart(ym, 1)).select(database.raw('month::text as month'), 'income_cents', 'expense_cents');
      const open = await database('financial_transactions').where({ organization_id: m.org, kind: 'income', status: 'open' })
        .select(database.raw('coalesce(sum(amount_cents), 0)::bigint as total'), database.raw('count(*)::int as n'),
          database.raw('coalesce(sum(amount_cents) filter (where due_date < ?), 0)::bigint as overdue', [today]),
          database.raw('(count(*) filter (where due_date < ?))::int as overdue_n', [today])).first();
      res.json({
        data: {
          today,
          months: fillMonths(rows, ym, 6),
          receivable: { total_cents: Number(open?.total ?? 0), count: open?.n ?? 0, overdue_cents: Number(open?.overdue ?? 0), overdue_count: open?.overdue_n ?? 0 },
        },
      });
    });

    router.post('/finance/transactions', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const r = validateTransaction(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        const [row] = await database('financial_transactions').insert({ ...r.value, organization_id: m.org, user_created: m.user }).returning('id');
        res.status(201).json({ data: txOut(await txQuery(m.org).where('t.id', row.id ?? row).first(TX_FIELDS)) });
      } catch (error) {
        finConflict(res, error);
      }
    });

    router.put('/finance/transactions/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const own = await database('financial_transactions').where({ id: req.params.id, organization_id: m.org }).first('id');
      if (!own) return finNotFound(res);
      const r = validateTransaction(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        await withActor(m.user, (trx) => trx('financial_transactions').where('id', own.id).update(r.value));
        res.json({ data: txOut(await txQuery(m.org).where('t.id', own.id).first(TX_FIELDS)) });
      } catch (error) {
        finConflict(res, error);
      }
    });

    router.delete('/finance/transactions/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const own = await database('financial_transactions').where({ id: req.params.id, organization_id: m.org }).first('id');
      if (!own) return finNotFound(res);
      if (m.role === 'assistant') return res.status(403).json({ errors: [{ message: 'Só owner ou nutricionista exclui lançamentos. Você pode cancelar.', extensions: { code: 'FORBIDDEN' } }] });
      try {
        await database.transaction(async (trx) => {
          await trx.raw("select set_config('rafanutri.actor', ?, true)", [m.user]);
          await trx('financial_transactions').where('id', own.id).del();
        });
        res.json({ data: { ok: true } });
      } catch (error) {
        finConflict(res, error);
      }
    });

    // Pré-preenchimento do "Registrar pagamento" na consulta.
    router.get('/finance/appointment/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const a = await database('appointments as a').join('patients as p', 'p.id', 'a.patient_id')
        .where({ 'a.id': req.params.id, 'a.organization_id': m.org }).first('a.id', 'a.patient_id', 'p.full_name as patient_name', 'a.starts_at', 'a.type', 'a.status');
      if (!a) return finNotFound(res);
      const existing = await database('financial_transactions').where('appointment_id', a.id).whereNot('status', 'cancelled').first('id', 'status');
      const last = await database('financial_transactions').where({ organization_id: m.org, patient_id: a.patient_id, kind: 'income' }).whereNot('status', 'cancelled')
        .orderBy('date_created', 'desc').first('amount_cents');
      res.json({ data: { ...a, existing: existing ?? null, last_amount_cents: last ? Number(last.amount_cents) : null } });
    });

    // ── Recibos (RN-055) ────────────────────────────────────────────────────────────────────────
    const RECEIPT_FIELDS = ['id', 'number', 'issued_at', 'amount_cents', database.raw('paid_at::text as paid_at'), 'payment_method', 'service', 'payer_name', 'payer_cpf',
      'issuer_name', 'issuer_crn', 'issuer_tax_id', 'practice_name', 'transaction_id'];
    const receiptOut = (r) => (r ? { ...r, amount_cents: Number(r.amount_cents) } : r);
    async function receiptPayload(orgId, id) {
      const r = await database('receipts').where({ id, organization_id: orgId }).first(RECEIPT_FIELDS);
      if (!r) return null;
      const org = await database('organizations').where('id', orgId).first('brand_color');
      return { receipt: receiptOut(r), header: { organization_id: orgId, brand_color: org?.brand_color ?? null } };
    }
    /** Quem assina: o nutricionista da consulta, senão quem emite (se clínico), senão o owner. */
    async function receiptIssuer(orgId, tx, user, role) {
      let issuerId = null;
      if (tx.appointment_id) issuerId = (await database('appointments').where('id', tx.appointment_id).first('nutritionist_id'))?.nutritionist_id ?? null;
      if (!issuerId && role !== 'assistant') issuerId = user;
      if (!issuerId) issuerId = (await database('organization_members').where({ organization_id: orgId, role: 'owner' }).first('user_id'))?.user_id ?? user;
      const u = await database('directus_users').where('id', issuerId).first('first_name', 'last_name', 'email');
      const prof = await database('professional_profiles').where('user_id', issuerId).first('crn', 'crn_region');
      return {
        issuer_name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.email || 'Nutricionista',
        issuer_crn: prof?.crn ? `${prof.crn_region ?? 'CRN'} ${prof.crn}` : null,
      };
    }

    // Emite (ou devolve o já emitido) o recibo de um recebimento pago. Corpo opcional: { payer_name, payer_cpf, service }.
    router.post('/finance/transactions/:id/receipt', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const tx = await database('financial_transactions').where({ id: req.params.id, organization_id: m.org }).first();
      if (!tx) return finNotFound(res);
      const existing = await database('receipts').where('transaction_id', tx.id).first('id');
      if (existing) return res.json({ data: await receiptPayload(m.org, existing.id) });
      if (tx.kind !== 'income' || tx.status !== 'paid') return conflict(res, 'Recibo só de recebimento pago.');
      const patient = tx.patient_id ? await database('patients').where('id', tx.patient_id).first('full_name', 'cpf') : null;
      const b = req.body ?? {};
      const payerName = (typeof b.payer_name === 'string' && b.payer_name.trim() ? b.payer_name : patient?.full_name ?? '').trim().replace(/\s+/g, ' ');
      const cpfRaw = typeof b.payer_cpf === 'string' ? b.payer_cpf.replace(/\D/g, '') : patient?.cpf ?? '';
      const service = (typeof b.service === 'string' && b.service.trim() ? b.service : tx.description).trim().replace(/\s+/g, ' ');
      const errors = {};
      if (payerName.length < 2 || payerName.length > 160) errors.payer_name = 'Informe o nome de quem pagou.';
      if (cpfRaw && cpfRaw.length !== 11) errors.payer_cpf = 'CPF com 11 dígitos.';
      if (service.length < 2 || service.length > 200) errors.service = 'Descreva o serviço (2 a 200 caracteres).';
      if (Object.keys(errors).length) return bad(res, errors);
      const org = await database('organizations').where('id', m.org).first('name', 'receipt_tax_id');
      try {
        const issuer = await receiptIssuer(m.org, tx, m.user, m.role);
        const [row] = await database('receipts').insert({
          organization_id: m.org, transaction_id: tx.id, number: 0, amount_cents: tx.amount_cents, paid_at: tx.paid_at,
          service, payer_name: payerName, payer_cpf: cpfRaw || null, ...issuer, issuer_tax_id: org?.receipt_tax_id ?? null,
          practice_name: org?.name ?? 'Consultório', user_created: m.user,
        }).returning('id');
        res.status(201).json({ data: await receiptPayload(m.org, row.id ?? row) });
      } catch (error) {
        if (error?.code === '23505') {
          const again = await database('receipts').where('transaction_id', tx.id).first('id');
          if (again) return res.json({ data: await receiptPayload(m.org, again.id) });
        }
        finConflict(res, error);
      }
    });

    router.get('/finance/receipts/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!isUuid(req.params.id)) return finNotFound(res);
      const p = await receiptPayload(m.org, req.params.id);
      if (!p) return finNotFound(res);
      logAccess(m.org, m.user, 'receipts', req.params.id, null, 'export');
      res.json({ data: p });
    });

    // ── Pacotes de consultas (RN-054) ───────────────────────────────────────────────────────────
    const pkgNotFound = (res) => res.status(404).json({ errors: [{ message: 'Pacote não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const PKG_FIELDS = ['id', 'name', 'sessions', 'price_cents', 'validity_days', 'active'];
    const pkgOut = (p) => ({ ...p, price_cents: Number(p.price_cents) });
    const PP_FIELDS = ['id', 'name', 'sessions_total', 'sessions_used', 'price_cents', database.raw('sold_at::text as sold_at'), database.raw('expires_at::text as expires_at'), 'status', 'package_id'];
    const ppOut = (p) => ({ ...p, price_cents: Number(p.price_cents) });
    const clinical = (m) => m.role === 'owner' || m.role === 'nutritionist';
    const forbidClinical = (res) => res.status(403).json({ errors: [{ message: 'Só owner ou nutricionista do consultório pode fazer isso.', extensions: { code: 'FORBIDDEN' } }] });

    router.get('/packages', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const rows = await database('service_packages').where('organization_id', m.org).orderBy([{ column: 'active', order: 'desc' }, { column: 'name' }]).select(PKG_FIELDS);
      res.json({ data: rows.map(pkgOut) });
    });

    async function savePackage(req, res, id) {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      const r = validatePackage(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        if (id) {
          if (!isUuid(id)) return pkgNotFound(res);
          const [row] = await database('service_packages').where({ id, organization_id: m.org }).update(r.value).returning(PKG_FIELDS);
          return row ? res.json({ data: pkgOut(row) }) : pkgNotFound(res);
        }
        const [row] = await database('service_packages').insert({ ...r.value, organization_id: m.org, user_created: m.user }).returning(PKG_FIELDS);
        res.status(201).json({ data: pkgOut(row) });
      } catch (error) {
        finConflict(res, error);
      }
    }
    router.post('/packages', (req, res) => savePackage(req, res, null));
    router.put('/packages/:id', (req, res) => savePackage(req, res, req.params.id));

    async function memberPatient(m, id) {
      if (!isUuid(id)) return null;
      return database('patients').where({ id, organization_id: m.org }).first('id', 'full_name', 'status');
    }

    router.get('/patients/:id/packages', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const p = await memberPatient(m, req.params.id);
      if (!p) return pkgNotFound(res);
      await database.raw('select expire_patient_packages(?)', [m.org]);
      const rows = await database('patient_packages').where('patient_id', p.id).orderBy('date_created', 'desc').select(PP_FIELDS);
      const uses = rows.length
        ? await database('appointments').whereIn('patient_package_id', rows.map((r) => r.id)).where('status', 'completed').orderBy('starts_at').select('patient_package_id', 'starts_at')
        : [];
      res.json({ data: rows.map((r) => ({ ...ppOut(r), sessions: uses.filter((u) => u.patient_package_id === r.id).map((u) => u.starts_at) })) });
    });

    // Venda: pacote do catálogo, à vista (1) ou em até 12 parcelas; gera os lançamentos no financeiro.
    router.post('/patients/:id/packages', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      const p = await memberPatient(m, req.params.id);
      if (!p) return pkgNotFound(res);
      const b = req.body ?? {};
      const pkg = isUuid(b.package_id) ? await database('service_packages').where({ id: b.package_id, organization_id: m.org, active: true }).first() : null;
      if (!pkg) return bad(res, { package_id: 'Escolha um pacote ativo do catálogo.' });
      const today = todaySP();
      const n = Number(b.installments ?? 1);
      const parts = splitInstallments(Number(pkg.price_cents), n, isIsoDate(b.first_due_date) ? b.first_due_date : today);
      if (!parts) return bad(res, { installments: 'De 1 a 12 parcelas e data válida.' });
      const method = b.payment_method == null || b.payment_method === '' ? null : String(b.payment_method);
      if (method && !['pix', 'cash', 'debit', 'credit', 'transfer', 'boleto', 'other'].includes(method)) return bad(res, { payment_method: 'Forma de pagamento inválida.' });
      const cat = await database('financial_categories').whereNull('organization_id').where({ kind: 'income', name: 'Pacote' }).first('id');
      try {
        const id = await database.transaction(async (trx) => {
          const expires = pkg.validity_days ? new Date(Date.parse(`${today}T12:00:00Z`) + pkg.validity_days * 86_400_000).toISOString().slice(0, 10) : null;
          const [pp] = await trx('patient_packages').insert({
            organization_id: m.org, patient_id: p.id, package_id: pkg.id, name: pkg.name, sessions_total: pkg.sessions,
            price_cents: pkg.price_cents, sold_at: today, expires_at: expires, user_created: m.user,
          }).returning('id');
          const ppId = pp.id ?? pp;
          await trx('financial_transactions').insert(parts.map((x) => ({
            organization_id: m.org, kind: 'income', category_id: cat.id, user_created: m.user, patient_id: p.id, patient_package_id: ppId,
            description: `${pkg.name}${n > 1 ? ` (${x.number}/${n})` : ''} — ${p.full_name}`.slice(0, 200),
            amount_cents: x.amount_cents, due_date: x.due_date, payment_method: method,
            status: x.number === 1 && b.paid_now === true ? 'paid' : 'open', paid_at: x.number === 1 && b.paid_now === true ? today : null,
          })));
          return ppId;
        });
        res.status(201).json({ data: ppOut(await database('patient_packages').where('id', id).first(PP_FIELDS)) });
      } catch (error) {
        finConflict(res, error);
      }
    });

    // Cancela o pacote vendido e as parcelas ainda em aberto (as pagas ficam).
    router.post('/patient-packages/:id/cancel', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      if (!isUuid(req.params.id)) return pkgNotFound(res);
      const pp = await database('patient_packages').where({ id: req.params.id, organization_id: m.org }).first('id', 'status');
      if (!pp) return pkgNotFound(res);
      try {
        await withActor(m.user, async (trx) => {
          await trx('patient_packages').where('id', pp.id).update({ status: 'cancelled' });
          await trx('financial_transactions').where({ patient_package_id: pp.id, status: 'open' }).update({ status: 'cancelled', paid_at: null });
        });
        res.json({ data: ppOut(await database('patient_packages').where('id', pp.id).first(PP_FIELDS)) });
      } catch (error) {
        finConflict(res, error);
      }
    });

    // Agenda: pacote ativo de cada paciente (para mostrar "sessão x de y" e avisar a última).
    router.get('/packages/agenda', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const ids = String(req.query.patients ?? '').split(',').filter(isUuid).slice(0, 200);
      if (!ids.length) return res.json({ data: {} });
      await database.raw('select expire_patient_packages(?)', [m.org]);
      const rows = await database('patient_packages').where('organization_id', m.org).whereIn('patient_id', ids).where('status', 'active')
        .orderBy([{ column: 'sold_at' }, { column: 'date_created' }]).select('patient_id', 'name', 'sessions_used', 'sessions_total');
      const out = {};
      for (const r of rows) if (!out[r.patient_id]) out[r.patient_id] = { name: r.name, used: r.sessions_used, total: r.sessions_total };
      res.json({ data: out });
    });

    // ── CRM: funil e retornos (RN-056) ──────────────────────────────────────────────────────────
    const leadNotFound = (res) => res.status(404).json({ errors: [{ message: 'Lead não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
    const LEAD_FIELDS = ['id', 'full_name', 'phone', 'email', 'source', 'stage', 'lost_reason', 'notes', 'patient_id', 'date_created', 'date_updated'];
    const crmConflict = (res, error) => {
      if (error?.code === 'P0001') return conflict(res, error.message.split('\n')[0].replace(/^.* - /, ''));
      logger.error({ err: error }, 'rafanutri: falha no CRM');
      return res.status(500).json({ errors: [{ message: 'Não foi possível salvar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
    };
    async function withActor(user, fn) {
      return database.transaction(async (trx) => {
        await trx.raw("select set_config('rafanutri.actor', ?, true)", [user]);
        return fn(trx);
      });
    }

    // Quadro: leads (novos, em contato, perdidos nos últimos 90 dias) e pacientes ativos por etapa.
    router.get('/crm/board', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      await database.raw('select crm_mark_inactive(?)', [m.org]);
      const leads = await database('leads').where('organization_id', m.org)
        .where((q) => q.whereIn('stage', ['new', 'contacted']).orWhere((q2) => q2.where('stage', 'lost').where('date_updated', '>', database.raw("now() - interval '90 days'"))))
        .orderBy('date_created', 'desc').limit(500).select(LEAD_FIELDS);
      const patients = await database('patients as p').where({ 'p.organization_id': m.org, 'p.status': 'active' }).whereNotNull('p.crm_stage')
        .select('p.id', 'p.full_name', 'p.phone', 'p.crm_stage', 'p.lead_source',
          database.raw("(select max(a.starts_at) from appointments a where a.patient_id = p.id and a.status = 'completed') as last_visit"),
          database.raw("(select min(a.starts_at) from appointments a where a.patient_id = p.id and a.status in ('scheduled', 'confirmed') and a.starts_at > now()) as next_visit"))
        .orderBy('p.full_name').limit(1000);
      const waiting = await database('patients as p').where({ 'p.organization_id': m.org, 'p.status': 'active' }).whereNull('p.crm_stage').count({ n: '*' }).first();
      res.json({ data: { leads, patients, without_visit: Number(waiting?.n ?? 0) } });
    });

    router.post('/crm/leads', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const r = validateLead(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        const [row] = await withActor(m.user, (trx) => trx('leads').insert({ ...r.value, organization_id: m.org, user_created: m.user, stage: req.body?.stage === 'contacted' ? 'contacted' : 'new' }).returning(LEAD_FIELDS));
        res.status(201).json({ data: row });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    async function ownLead(m, id) {
      if (!isUuid(id)) return null;
      return database('leads').where({ id, organization_id: m.org }).first();
    }

    router.put('/crm/leads/:id', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const lead = await ownLead(m, req.params.id);
      if (!lead) return leadNotFound(res);
      const r = validateLead(req.body);
      if (r.errors) return bad(res, r.errors);
      try {
        const [row] = await withActor(m.user, (trx) => trx('leads').where('id', lead.id).update(r.value).returning(LEAD_FIELDS));
        res.json({ data: row });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    // Mover no funil: novo, em contato ou perdido (com motivo). Converter tem endpoint próprio.
    router.post('/crm/leads/:id/stage', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const lead = await ownLead(m, req.params.id);
      if (!lead) return leadNotFound(res);
      const stage = ['new', 'contacted', 'lost'].includes(req.body?.stage) ? req.body.stage : null;
      if (!stage) return bad(res, { stage: 'Etapa inválida.' });
      const reason = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
      if (stage === 'lost' && (reason.length < 2 || reason.length > 300)) return bad(res, { note: 'Diga o motivo (2 a 300 caracteres).' });
      try {
        const [row] = await withActor(m.user, (trx) => trx('leads').where('id', lead.id).update({ stage, lost_reason: stage === 'lost' ? reason : null }).returning(LEAD_FIELDS));
        res.json({ data: row });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    // Converter: cria o paciente (ocupa vaga do plano) e liga ao lead.
    router.post('/crm/leads/:id/convert', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const lead = await ownLead(m, req.params.id);
      if (!lead) return leadNotFound(res);
      if (lead.stage === 'converted') return res.json({ data: { patient_id: lead.patient_id } });
      if (lead.full_name.length < 3) return bad(res, { full_name: 'Para virar paciente, o nome precisa de 3 letras ou mais.' });
      try {
        const patientId = await withActor(m.user, async (trx) => {
          const [p] = await trx('patients').insert({ organization_id: m.org, responsible_user_id: m.user, full_name: lead.full_name, phone: lead.phone, email: lead.email, lead_source: lead.source }).returning('id');
          const pid = p.id ?? p;
          await trx('leads').where('id', lead.id).update({ stage: 'converted', patient_id: pid });
          return pid;
        });
        res.status(201).json({ data: { patient_id: patientId } });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    // Retornos: pacientes ativos com consulta concluída, nada marcado, retorno previsto = última + intervalo.
    // ?window=overdue | 7 | 30 (padrão: vencidos + próximos 30 dias)
    router.get('/crm/returns', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const today = todaySP();
      const w = req.query.window;
      const rows = await database.raw(`
        select * from (
          select p.id, p.full_name, p.phone, p.return_interval_days, p.crm_stage,
                 (max(a.starts_at) at time zone 'America/Sao_Paulo')::date::text as last_visit,
                 ((max(a.starts_at) at time zone 'America/Sao_Paulo')::date + p.return_interval_days)::text as due_date
            from patients p join appointments a on a.patient_id = p.id and a.status = 'completed'
           where p.organization_id = ? and p.status = 'active'
             and not exists (select 1 from appointments x where x.patient_id = p.id and x.status in ('scheduled', 'confirmed') and x.starts_at > now())
           group by p.id
        ) r
        where (? = 'overdue' and r.due_date < ?)
           or (? in ('7', '30') and r.due_date >= ? and r.due_date::date <= ?::date + (?)::int)
           or (? not in ('overdue', '7', '30') and r.due_date::date <= ?::date + 30)
        order by r.due_date
        limit 500`, [m.org, w ?? '', today, w ?? '', today, today, w === '7' ? 7 : 30, w ?? '', today]);
      res.json({ data: { today, returns: rows.rows } });
    });

    router.put('/patients/:id/return-interval', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      const p = await memberPatient(m, req.params.id);
      if (!p) return res.status(404).json({ errors: [{ message: 'Paciente não encontrado.', extensions: { code: 'NOT_FOUND' } }] });
      const days = Number(req.body?.days);
      if (!Number.isInteger(days) || days < 7 || days > 365) return bad(res, { days: 'De 7 a 365 dias.' });
      await withActor(m.user, (trx) => trx('patients').where('id', p.id).update({ return_interval_days: days }));
      res.json({ data: { return_interval_days: days } });
    });

    // Indicadores dos últimos `days` dias (padrão 90): leads por origem e conversão em 1ª consulta.
    router.get('/crm/metrics', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const days = [30, 90, 180, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 90;
      const r = await database.raw(`
        select l.source,
               count(*)::int as leads,
               count(*) filter (where l.stage = 'converted')::int as converted,
               count(*) filter (where l.stage = 'lost')::int as lost,
               count(*) filter (where l.stage = 'converted' and exists (
                 select 1 from appointments a where a.patient_id = l.patient_id and a.status = 'completed'))::int as first_visit
          from leads l
         where l.organization_id = ? and l.date_created > now() - make_interval(days => ?)
         group by l.source order by count(*) desc`, [m.org, days]);
      res.json({ data: { days, by_source: r.rows } });
    });

    // ── Indicadores do consultório (RN-064) ─────────────────────────────────────────────────────
    // ?month=aaaa-mm (padrão: mês atual) &nutritionist=<membro clínico> (só filtra se for do consultório).
    router.get('/dashboard', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month ?? '') ? `${req.query.month}-15` : null;
      const nutritionists = await database('organization_members as om').join('directus_users as u', 'u.id', 'om.user_id')
        .where('om.organization_id', m.org).whereIn('om.role', ['owner', 'nutritionist'])
        .select('u.id', database.raw("trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as name"), 'u.email');
      const nutri = isUuid(req.query.nutritionist) && nutritionists.some((n) => n.id === req.query.nutritionist) ? req.query.nutritionist : null;
      const r = await database.raw('select dashboard_indicators(?, ?::date, ?::uuid) as j', [m.org, month, nutri]);
      res.json({
        data: {
          ...r.rows[0].j,
          nutritionist: nutri,
          nutritionists: nutritionists.length > 1 ? nutritionists.map((n) => ({ id: n.id, name: n.name || n.email })) : [],
        },
      });
    });

    // ── Página pública e agendamento online (RN-068) ────────────────────────────────────────────
    const pubNotFound = (res) => res.status(404).json({ errors: [{ message: 'Página não encontrada.', extensions: { code: 'NOT_FOUND' } }] });
    const PROFILE_FIELDS = ['enabled', 'headline', 'bio', 'specialties', 'address', 'city', 'in_person', 'online', 'price_first_cents', 'price_return_cents',
      'booking_enabled', 'require_approval', 'nutritionist_id', 'weekdays', database.raw("to_char(day_start, 'HH24:MI') as day_start"), database.raw("to_char(day_end, 'HH24:MI') as day_end"),
      'slot_minutes', 'min_notice_hours', 'max_days_ahead'];
    const profileOut = (p) => p && ({ ...p, price_first_cents: p.price_first_cents == null ? null : Number(p.price_first_cents), price_return_cents: p.price_return_cents == null ? null : Number(p.price_return_cents) });
    async function publicPractice(slug) {
      if (typeof slug !== 'string' || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
      const org = await database('organizations').where('slug', slug).first('id', 'name', 'brand_color', 'logo', 'plan', 'modules');
      if (!org) return null;
      const profile = profileOut(await database('public_profiles').where({ organization_id: org.id, enabled: true }).first(PROFILE_FIELDS));
      if (!profile) return null;
      const nutri = profile.nutritionist_id ?? (await database('organization_members').where({ organization_id: org.id, role: 'owner' }).first('user_id'))?.user_id;
      // Agendamento online é do módulo Gestão: no plano Gratuito a página pública fica, sem marcar horário
      const booking = profile.booking_enabled && hasPractice(org);
      return { org, profile: { ...profile, booking_enabled: booking, nutritionist_id: nutri } };
    }
    async function busyIntervals(orgId, nutri, from, to) {
      const a = await database('appointments').where({ organization_id: orgId, nutritionist_id: nutri }).whereIn('status', ['scheduled', 'confirmed', 'completed'])
        .where('starts_at', '<', to).where('ends_at', '>', from).select('starts_at', 'ends_at');
      const r = await database('booking_requests').where({ organization_id: orgId, nutritionist_id: nutri, status: 'pending' })
        .where('starts_at', '<', to).where('ends_at', '>', from).select('starts_at', 'ends_at');
      return [...a, ...r].map((x) => [new Date(x.starts_at).getTime(), new Date(x.ends_at).getTime()]);
    }

    router.get('/public/practices/:slug', async (req, res) => {
      const p = await publicPractice(req.params.slug);
      if (!p) return pubNotFound(res);
      const u = await database('directus_users').where('id', p.profile.nutritionist_id).first('first_name', 'last_name');
      const prof = await database('professional_profiles').where('user_id', p.profile.nutritionist_id).first('crn', 'crn_region');
      const { nutritionist_id: _n, require_approval, ...rest } = p.profile;
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.json({
        data: {
          name: p.org.name, brand_color: p.org.brand_color, has_logo: Boolean(p.org.logo), require_approval,
          professional: { name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || null, crn: prof?.crn ? `${prof.crn_region ?? 'CRN'} ${prof.crn}` : null },
          ...rest,
        },
      });
    });

    router.get('/public/practices/:slug/logo', async (req, res) => {
      const p = await publicPractice(req.params.slug);
      if (!p?.org.logo) return pubNotFound(res);
      try {
        const assets = new services.AssetsService({ schema: await getSchema(), accountability: null });
        const { stream, file } = await assets.getAsset(p.org.logo);
        res.setHeader('Content-Type', file.type ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        stream.pipe(res);
      } catch {
        pubNotFound(res);
      }
    });

    // Horários livres (só horários, nada sobre as consultas). ?from=aaaa-mm-dd&days=1..14
    router.get('/public/practices/:slug/slots', async (req, res) => {
      const p = await publicPractice(req.params.slug);
      if (!p || !p.profile.booking_enabled) return pubNotFound(res);
      const now = new Date();
      const from = isIsoDate(req.query.from) && req.query.from >= localDateOf(now) ? req.query.from : localDateOf(now);
      const days = Math.min(14, Math.max(1, Number(req.query.days) || 7));
      const start = new Date(`${from}T00:00:00-03:00`);
      const end = new Date(start.getTime() + (days + 1) * 86_400_000);
      const busy = await busyIntervals(p.org.id, p.profile.nutritionist_id, start, end);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: { from, days: publicSlots(p.profile, busy, from, days, now), slot_minutes: p.profile.slot_minutes } });
    });

    /** Confirma o pedido: paciente (o mesmo e-mail no consultório ou novo, dentro do limite) + consulta. */
    async function confirmBooking(reqRow, actor) {
      return database.transaction(async (trx) => {
        await trx.raw("select set_config('rafanutri.actor', ?, true)", [actor]);
        let patient = await trx('patients').where({ organization_id: reqRow.organization_id }).whereRaw('lower(email) = ?', [reqRow.email]).whereNot('status', 'archived')
          .orderByRaw("status = 'active' desc").first('id', 'status');
        if (!patient) {
          const [p] = await trx('patients').insert({ organization_id: reqRow.organization_id, responsible_user_id: reqRow.nutritionist_id, full_name: reqRow.full_name, email: reqRow.email, phone: reqRow.phone, lead_source: 'site' }).returning('id');
          patient = { id: p.id ?? p };
        }
        const [a] = await trx('appointments').insert({
          organization_id: reqRow.organization_id, patient_id: patient.id, nutritionist_id: reqRow.nutritionist_id, starts_at: reqRow.starts_at, ends_at: reqRow.ends_at,
          type: 'first', mode: reqRow.mode, status: 'scheduled', origin: 'online_booking', notes: reqRow.message ? `Agendamento online: ${reqRow.message}`.slice(0, 500) : 'Agendamento online', user_created: reqRow.nutritionist_id,
        }).returning('id');
        await trx('booking_requests').where('id', reqRow.id).update({ status: 'confirmed', patient_id: patient.id, appointment_id: a.id ?? a, decided_by: actor, decided_at: trx.fn.now() });
        return { patient_id: patient.id, appointment_id: a.id ?? a };
      });
    }

    router.post('/public/practices/:slug/book', async (req, res) => {
      const p = await publicPractice(req.params.slug);
      if (!p || !p.profile.booking_enabled) return pubNotFound(res);
      const v = validateBooking(req.body, p.profile);
      if (v.spam) return res.status(201).json({ data: { status: 'pending' } }); // campo-isca: finge sucesso
      if (v.errors) return bad(res, v.errors);
      const now = new Date();
      const s = new Date(v.value.starts_at);
      const e = new Date(s.getTime() + p.profile.slot_minutes * 60_000);
      const busy = await busyIntervals(p.org.id, p.profile.nutritionist_id, new Date(s.getTime() - 86_400_000), new Date(e.getTime() + 86_400_000));
      if (!isOfferedSlot(p.profile, busy, v.value.starts_at, now)) return conflict(res, 'Esse horário não está mais disponível. Escolha outro.');
      const today = await database('booking_requests').where('organization_id', p.org.id).where('created_at', '>', database.raw("now() - interval '1 day'")).count({ n: '*' }).first();
      if (Number(today?.n ?? 0) >= 30) return res.status(429).json({ errors: [{ message: 'Muitos pedidos hoje. Tente amanhã ou fale direto com o consultório.', extensions: { code: 'TOO_MANY' } }] });
      const mine = await database('booking_requests').where({ organization_id: p.org.id, status: 'pending' }).where((q) => q.where('email', v.value.email).orWhere('phone', v.value.phone)).count({ n: '*' }).first();
      if (Number(mine?.n ?? 0) >= 2) return conflict(res, 'Você já tem pedidos aguardando confirmação. O consultório vai entrar em contato.');
      let row;
      try {
        [row] = await database('booking_requests').insert({ organization_id: p.org.id, nutritionist_id: p.profile.nutritionist_id, ...v.value, ends_at: e.toISOString() }).returning('*');
      } catch (error) {
        if (error?.code === 'P0001') return conflict(res, 'Esse horário não está mais disponível. Escolha outro.');
        logger.error({ err: error }, 'rafanutri: falha no agendamento online');
        return res.status(500).json({ errors: [{ message: 'Não foi possível agendar agora.', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] });
      }
      if (!p.profile.require_approval) {
        try {
          await confirmBooking(row, p.profile.nutritionist_id);
          return res.status(201).json({ data: { status: 'confirmed', starts_at: row.starts_at } });
        } catch (error) {
          logger.warn({ err: error?.message }, 'rafanutri: agendamento online ficou pendente');
        }
      }
      res.status(201).json({ data: { status: 'pending', starts_at: row.starts_at } });
    });

    // Configuração da página (owner)
    router.get('/practices/:id/public-profile', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await ownedOrg(user, req.params.id);
      if (!org) return orgNotFound(res);
      const o = await database('organizations').where('id', org.id).first('slug');
      const profile = profileOut(await database('public_profiles').where('organization_id', org.id).first(PROFILE_FIELDS));
      const nutritionists = await database('organization_members as om').join('directus_users as u', 'u.id', 'om.user_id')
        .where('om.organization_id', org.id).whereIn('om.role', ['owner', 'nutritionist'])
        .select('u.id', database.raw("trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) as name"), 'u.email');
      res.json({ data: { slug: o.slug, profile, nutritionists: nutritionists.map((n) => ({ id: n.id, name: n.name || n.email })) } });
    });

    router.put('/practices/:id/public-profile', async (req, res) => {
      const user = requireUser(req, res);
      if (!user) return;
      const org = await ownedOrg(user, req.params.id);
      if (!org) return orgNotFound(res);
      const b = req.body ?? {};
      const errors = {};
      const text = (v, max, key, label) => {
        if (v == null || String(v).trim() === '') return null;
        const t = String(v).trim();
        if (t.length > max) errors[key] = `${label} de até ${max} caracteres.`;
        return t;
      };
      const time = (v, key) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : ((errors[key] = 'Horário inválido.'), null));
      const cents = (v, key) => (v == null || v === '' ? null : Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : ((errors[key] = 'Valor inválido.'), null));
      const specialties = Array.isArray(b.specialties) ? [...new Set(b.specialties.map((s) => String(s).trim()).filter(Boolean))] : [];
      if (specialties.length > 10 || specialties.some((s) => s.length > 40)) errors.specialties = 'Até 10 especialidades de até 40 caracteres.';
      const weekdays = Array.isArray(b.weekdays) ? [...new Set(b.weekdays.map(Number))].filter((d) => d >= 1 && d <= 7).sort() : [];
      if (!weekdays.length) errors.weekdays = 'Escolha ao menos um dia.';
      const value = {
        enabled: b.enabled === true, booking_enabled: b.booking_enabled === true, require_approval: b.require_approval !== false,
        headline: text(b.headline, 120, 'headline', 'Chamada'), bio: text(b.bio, 1500, 'bio', 'Apresentação'), address: text(b.address, 200, 'address', 'Endereço'), city: text(b.city, 80, 'city', 'Cidade'),
        specialties: JSON.stringify(specialties), in_person: b.in_person !== false, online: b.online !== false,
        price_first_cents: cents(b.price_first_cents, 'price_first_cents'), price_return_cents: cents(b.price_return_cents, 'price_return_cents'),
        nutritionist_id: isUuid(b.nutritionist_id) ? b.nutritionist_id : null, weekdays,
        day_start: time(b.day_start, 'day_start'), day_end: time(b.day_end, 'day_end'),
        slot_minutes: [30, 45, 60, 90].includes(Number(b.slot_minutes)) ? Number(b.slot_minutes) : 60,
        min_notice_hours: Math.min(168, Math.max(0, Number(b.min_notice_hours) || 0)), max_days_ahead: Math.min(90, Math.max(1, Number(b.max_days_ahead) || 30)),
      };
      if (!value.in_person && !value.online) errors.in_person = 'Escolha ao menos uma modalidade.';
      if (value.day_start && value.day_end && value.day_end <= value.day_start) errors.day_end = 'O fim do expediente precisa ser depois do início.';
      if (Object.keys(errors).length) return bad(res, errors);
      try {
        await database('public_profiles').insert({ organization_id: org.id, ...value }).onConflict('organization_id').merge();
        res.json({ data: profileOut(await database('public_profiles').where('organization_id', org.id).first(PROFILE_FIELDS)) });
      } catch (error) {
        crmConflict(res, error);
      }
    });

    // Pedidos de agendamento (agenda do consultório)
    router.get('/booking-requests', async (req, res) => {
      const m = await finMember(req, res);
      if (!m) return;
      const rows = await database('booking_requests').where({ organization_id: m.org, status: 'pending' }).orderBy('starts_at')
        .select('id', 'full_name', 'email', 'phone', 'mode', 'starts_at', 'ends_at', 'message', 'created_at');
      res.json({ data: rows });
    });

    async function decide(req, res, confirm) {
      const m = await finMember(req, res);
      if (!m) return;
      if (!clinical(m)) return forbidClinical(res);
      if (!isUuid(req.params.id)) return pubNotFound(res);
      const row = await database('booking_requests').where({ id: req.params.id, organization_id: m.org, status: 'pending' }).first();
      if (!row) return res.status(404).json({ errors: [{ message: 'Pedido não encontrado ou já decidido.', extensions: { code: 'NOT_FOUND' } }] });
      try {
        if (confirm) return res.json({ data: await confirmBooking(row, m.user) });
        await database('booking_requests').where('id', row.id).update({ status: 'declined', decided_by: m.user, decided_at: database.fn.now() });
        res.json({ data: { ok: true } });
      } catch (error) {
        if (error?.code === 'P0001' && /limite|permite no máximo/i.test(error.message)) return conflict(res, 'Limite de pacientes ativos do plano: arquive um paciente para confirmar.');
        crmConflict(res, error);
      }
    }
    router.post('/booking-requests/:id/confirm', (req, res) => decide(req, res, true));
    router.post('/booking-requests/:id/decline', (req, res) => decide(req, res, false));

  return { finMember, pubNotFound, withActor };
}
