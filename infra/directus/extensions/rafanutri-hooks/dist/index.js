// Ganchos de integridade multi-tenant e mensagens de limite do plano.
import { createError } from '@directus/errors';

const ForbiddenTenant = createError('FORBIDDEN', 'Você não tem acesso a esta organização.', 403);
const InvalidPayload = createError('INVALID_PAYLOAD', (ext) => ext.message, 400);
const PatientLimit = createError('PATIENT_LIMIT_REACHED', (ext) => `Você atingiu o limite de ${ext.limit} pacientes ativos do seu plano. Arquive pacientes ou conheça o plano pago.`, 409);

/** Coleção → papéis exigidos para gravar. */
const TENANT_COLLECTIONS = {
  patients: ['owner', 'nutritionist', 'assistant'],
  anthropometric_assessments: ['owner', 'nutritionist'],
  energy_calculations: ['owner', 'nutritionist'],
  foods: ['owner', 'nutritionist'],
};
const AUTHORED = new Set(['anthropometric_assessments', 'energy_calculations']);

export default ({ filter }, { database }) => {
  const isPrivileged = (acc) => !acc || acc.admin === true || !acc.user;

  async function assertMember(acc, orgId, roles) {
    if (!orgId) throw new InvalidPayload({ message: 'organization_id é obrigatório.' });
    const row = await database('organization_members')
      .where({ organization_id: orgId, user_id: acc.user })
      .whereIn('role', roles)
      .first();
    if (!row) throw new ForbiddenTenant();
  }

  async function assertPatientLimit(orgId) {
    const plan = await database('subscriptions as s')
      .join('plans as p', 'p.code', 's.plan_code')
      .where('s.organization_id', orgId)
      .first('p.max_active_patients');
    const limit = plan?.max_active_patients;
    if (!limit) return;
    const [{ count }] = await database('patients').where({ organization_id: orgId, status: 'active' }).count();
    if (Number(count) >= limit) throw new PatientLimit({ limit });
  }

  for (const [collection, roles] of Object.entries(TENANT_COLLECTIONS)) {
    filter(`${collection}.items.create`, async (payload, _meta, { accountability }) => {
      if (isPrivileged(accountability)) return payload;
      await assertMember(accountability, payload.organization_id, roles);
      if (AUTHORED.has(collection)) payload.author_id = accountability.user;
      if (collection === 'patients' && (payload.status ?? 'active') === 'active') {
        await assertPatientLimit(payload.organization_id);
      }
      return payload;
    });

    filter(`${collection}.items.update`, async (payload, meta, { accountability }) => {
      if (isPrivileged(accountability)) return payload;
      if ('organization_id' in payload) {
        throw new InvalidPayload({ message: 'Não é permitido mover registros entre organizações.' });
      }
      if (collection === 'patients' && payload.status === 'active') {
        const rows = await database('patients').whereIn('id', meta.keys).select('organization_id', 'status');
        for (const r of rows) if (r.status !== 'active') await assertPatientLimit(r.organization_id);
      }
      return payload;
    });
  }
};
