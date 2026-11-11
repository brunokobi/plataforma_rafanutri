// Ganchos da Rafanutri (ADR 0008): as permissões do Directus filtram leitura e edição,
// mas não validam relações na criação. Estes ganchos garantem que o usuário só cria
// registros no próprio consultório e antecipam as regras do banco com mensagens claras.
// As regras invioláveis continuam nos gatilhos do Postgres (migrações em db/).

/** Erro no formato que o Directus reconhece (isDirectusError) e devolve ao cliente. */
function directusError(status, code, message) {
  const error = new Error(message);
  error.name = 'DirectusError';
  error.status = status;
  error.code = code;
  error.extensions = { code };
  return error;
}
const forbidden = (message) => directusError(403, 'FORBIDDEN', message);
const invalid = (message) => directusError(400, 'INVALID_PAYLOAD', message);

/** Papéis que podem cadastrar e editar pacientes. */
export const CLINICAL_ROLES = ['owner', 'nutritionist'];

/** Usuário comum (não administrador, não processo interno do Directus). */
const isEndUser = (accountability) => Boolean(accountability?.user) && !accountability.admin;

export default ({ filter }, { database }) => {
  async function assertClinicalMember(organizationId, userId) {
    const member = await database('organization_members')
      .where({ organization_id: organizationId, user_id: userId })
      .whereIn('role', CLINICAL_ROLES)
      .first('id');
    if (!member) throw forbidden('Você não tem acesso a este consultório.');
  }

  async function assertActiveSlot(organizationId, excludeIds = []) {
    const row = await database('organizations as o')
      .join('plans as p', 'p.code', 'o.plan')
      .where('o.id', organizationId)
      .first('p.max_active_patients as lim', 'p.name as plan');
    if (!row || row.lim === null) return;
    const q = database('patients').where({ organization_id: organizationId, status: 'active' });
    if (excludeIds.length) q.whereNotIn('id', excludeIds);
    const { count } = await q.count({ count: '*' }).first();
    if (Number(count) >= row.lim) {
      throw invalid(`O plano ${row.plan} permite até ${row.lim} pacientes ativos. Arquive um paciente para liberar a vaga.`);
    }
  }

  filter('patients.items.create', async (payload, _meta, { accountability }) => {
    if (!isEndUser(accountability)) return payload;
    const organizationId = payload?.organization_id;
    if (!organizationId) throw invalid('Informe o consultório.');
    if (payload.responsible_user_id && payload.responsible_user_id !== accountability.user) {
      throw forbidden('O responsável pelo paciente é sempre quem cadastra.');
    }
    await assertClinicalMember(organizationId, accountability.user);
    if ((payload.status ?? 'active') === 'active') await assertActiveSlot(organizationId);
    // O responsável é sempre quem cadastra (não vem do cliente).
    return { ...payload, responsible_user_id: accountability.user };
  });

  filter('patients.items.update', async (payload, meta, { accountability }) => {
    if (!isEndUser(accountability)) return payload;
    if ('organization_id' in payload || 'responsible_user_id' in payload) {
      throw forbidden('Consultório e responsável não podem ser alterados por aqui.');
    }
    if (payload.status === 'active') {
      const keys = meta?.keys ?? [];
      const rows = await database('patients').whereIn('id', keys).select('id', 'organization_id', 'status');
      for (const orgId of new Set(rows.filter((r) => r.status !== 'active').map((r) => r.organization_id))) {
        await assertActiveSlot(orgId);
      }
    }
    return payload;
  });
};
