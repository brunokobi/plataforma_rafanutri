// Catálogos compartilhados entre o app web e a extensão do Directus: fonte única.
// O app importa daqui (@rafanutri/catalogs); a extensão usa a cópia directus/extensions/rafanutri/catalogs.js,
// gerada por: pnpm --filter @rafanutri/catalogs sync (test/catalogs.test.ts confere que a cópia está igual).
// JavaScript puro e sem dependências: a extensão roda sem build.

// ── Planos e módulos ─────────────────────────────────────────────────────────────────────────
/** Planos com o módulo Gestão do consultório (financeiro, pacotes, CRM, agendamento online e lembretes). */
export const PRACTICE_PLANS = ['essential', 'professional', 'clinic'];
/** Planos pagos (assinatura por Pix). */
export const PAID_PLANS = ['essential', 'professional', 'clinic'];
/** Planos com o módulo materno-infantil. */
export const MATERNAL_PLANS = ['professional', 'clinic'];
/** Pedidos por dia ao assistente de IA. */
export const AI_DAILY_LIMIT = { free: 5, essential: 5, professional: 200, clinic: 200, enterprise_uan: 0 };

// ── Documentos legais e o que o paciente vê ──────────────────────────────────────────────────
/** Versões vigentes dos termos e da política (aceite registrado em terms_acceptances). */
export const LEGAL_VERSIONS = { professional_terms: '2026-11-20', patient_terms: '2026-11-20', privacy: '2026-11-21' };
/** Chaves de "O que o paciente vê" (patient_share no banco). */
export const SHARE_KEYS = ['show_kcal', 'show_macros', 'show_weight_history', 'show_maternal'];

// ── Avisos ───────────────────────────────────────────────────────────────────────────────────
/** Tipos de aviso (mesma lista do CHECK de notification_outbox.kind) e se merecem e-mail sem Telegram. */
export const NOTIFICATION_KINDS = {
  appointment_reminder: { label: 'Lembrete de consulta', important: false },
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
/** Horários de lembrete permitidos (horas antes da consulta), do maior para o menor. */
export const REMINDER_HOURS = [72, 48, 24, 12, 6, 3, 2, 1];

// ── Painel clínico: quem precisa de atenção ──────────────────────────────────────────────────
export const ATTENTION_REASONS = {
  no_return: 'Retorno atrasado (passou do intervalo de retorno) e sem consulta marcada',
  never_seen: 'Cadastrado e ainda sem consulta',
  plan_expired: 'Plano alimentar vencido',
  plan_expiring: 'Plano alimentar vence em até 14 dias',
  no_plan: 'Atendido e sem plano publicado',
  no_assessment: 'Sem avaliação há mais de 90 dias',
  risk_high: 'Risco nutricional alto na última triagem',
  pending_anamnesis: 'Anamnese respondida aguardando revisão',
};
/** Limites das regras de atenção (dias). */
export const ATTENTION_RULES = { defaultReturnDays: 30, neverSeenGraceDays: 14, planExpiringDays: 14, noAssessmentDays: 90 };

// ── Materno-infantil ─────────────────────────────────────────────────────────────────────────
/** Alergênicos da introdução alimentar, com a idade de referência (meses) e a orientação. */
export const ALLERGENS = [
  { code: 'egg', label: 'Ovo', fromMonths: 6, tip: 'Ovo inteiro bem cozido (clara e gema), desde o início da introdução alimentar.' },
  { code: 'peanut', label: 'Amendoim', fromMonths: 6, tip: 'Em pasta diluída ou farinha misturada à comida; nunca o grão inteiro (risco de engasgo).' },
  { code: 'wheat', label: 'Trigo', fromMonths: 6, tip: 'Macarrão, pão ou farinha nas preparações.' },
  { code: 'fish', label: 'Peixe', fromMonths: 6, tip: 'Bem cozido, desfiado e sem espinhas.' },
  { code: 'soy', label: 'Soja', fromMonths: 6, tip: 'Grão cozido ou tofu nas refeições.' },
  { code: 'sesame', label: 'Gergelim', fromMonths: 6, tip: 'Tahine ou semente moída misturada à comida.' },
  { code: 'tree_nuts', label: 'Castanhas', fromMonths: 6, tip: 'Moídas ou em pasta; nunca inteiras antes dos 4 anos.' },
  { code: 'shellfish', label: 'Frutos do mar', fromMonths: 6, tip: 'Bem cozidos e picados, se fizerem parte da alimentação da família.' },
  { code: 'cow_milk', label: 'Leite de vaca', fromMonths: 12, tip: 'Como bebida, só depois de 1 ano; antes disso, em pequena quantidade nas preparações, se orientado.' },
];
/** Etapas de textura (Guia Alimentar para Crianças Menores de 2 Anos). */
export const TEXTURES = [
  { code: 'mashed', label: 'Amassada com garfo', fromMonths: 6, tip: 'Comida amassada, sem liquidificar nem peneirar.' },
  { code: 'soft_pieces', label: 'Pedaços pequenos e macios', fromMonths: 7, tip: 'Mais grossa, com pedaços para treinar a mastigação.' },
  { code: 'chopped', label: 'Picada ou desfiada', fromMonths: 9, tip: 'Perto da comida da família; a criança pega com a mão.' },
  { code: 'family', label: 'Comida da família', fromMonths: 12, tip: 'Mesma comida da família, com pouco sal e sem temperos prontos.' },
];
export const REACTION_LABEL = { none: 'Sem reação', mild: 'Reação leve', moderate: 'Reação moderada', severe: 'Reação grave' };
/** Reações que ficam em destaque e avisam o nutricionista quando o responsável registra. */
export const SERIOUS_REACTIONS = ['moderate', 'severe'];
export const FEEDING_TYPE_LABEL = {
  exclusive: 'Aleitamento materno exclusivo',
  predominant: 'Aleitamento predominante (leite materno e água, chás ou sucos)',
  complemented: 'Aleitamento complementado (leite materno e comida)',
  mixed: 'Aleitamento misto (leite materno e outro leite)',
};
export const RELATIONSHIP_LABEL = { mother: 'Mãe', father: 'Pai', grandparent: 'Avó ou avô', legal_guardian: 'Tutor legal', other: 'Outro' };
export const CONSENT_LABEL = { in_person: 'Presencial, na consulta', signed_form: 'Termo assinado', other: 'Outra forma' };

// ── Saúde pública ────────────────────────────────────────────────────────────────────────────
/** Ferramentas de triagem aceitas e a versão gravada (iguais às do @rafanutri/nutrition-core). */
export const SCREENING_TOOL_VERSIONS = { nrs_2002: 'nrs_2002@kondrup2003', must: 'must@bapen2011', sga: 'sga@detsky1987' };
