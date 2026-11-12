'use server';

import { validateQuestionnaire, type Questionnaire } from '@rafanutri/forms';
import { createItem, deleteItem, isDirectusError, updateItem, withToken } from '@directus/sdk';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus } from '@/lib/auth/directus';
import { getMyOrganizations } from '@/lib/auth/organizations';
import { isUuid } from '@/lib/patients/schema';
import { getTemplate } from './repository';

export type TemplateActionResult = { ok: true; id?: string } | { ok: false; message: string; problems?: string[] };

function failure(error: unknown, fallback: string): TemplateActionResult {
  if (isDirectusError(error)) {
    const status = error.response?.status;
    if (status === 403) return { ok: false, message: 'Você não tem permissão para alterar este modelo. Os modelos padrão só podem ser duplicados.' };
    if (status === 429) return { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto.' };
    console.error('questionnaires: erro do Directus', { status, code: error.errors?.[0]?.extensions?.code });
  } else {
    console.error('questionnaires: erro inesperado', error);
  }
  return { ok: false, message: fallback };
}

async function context() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
  const org = (await getMyOrganizations())?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;
  return { token, org };
}

/** Cria uma cópia editável (do consultório) de um modelo padrão ou próprio. */
export async function duplicateTemplate(id: string): Promise<TemplateActionResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const { token, org } = await context();
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  if (!org) return { ok: false, message: 'Configure seu consultório antes.' };
  const source = await getTemplate(id);
  if (!source) return { ok: false, message: 'Modelo não encontrado.' };
  try {
    const created = await directus().request<{ id: string }>(
      withToken(
        token,
        createItem('questionnaire_templates' as never, {
          organization_id: org.id,
          name: `${source.name} (cópia)`.slice(0, 120),
          description: source.description,
          schema: source.schema,
        } as never, { fields: ['id'] } as never),
      ),
    );
    revalidatePath('/app/questionarios');
    return { ok: true, id: created.id };
  } catch (error) {
    return failure(error, 'Não foi possível duplicar agora.');
  }
}

export async function saveTemplate(id: string, input: { name: string; description: string; schema: Questionnaire }): Promise<TemplateActionResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (name.length < 2 || name.length > 120) return { ok: false, message: 'Informe o nome do modelo (2 a 120 caracteres).' };
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 500) : '';
  const problems = validateQuestionnaire(input.schema);
  if (problems.length) return { ok: false, message: 'Revise o questionário.', problems };
  const { token } = await context();
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    await directus().request(withToken(token, updateItem('questionnaire_templates' as never, id, { name, description: description || null, schema: input.schema } as never)));
    revalidatePath('/app/questionarios');
    revalidatePath(`/app/questionarios/${id}`);
    return { ok: true };
  } catch (error) {
    return failure(error, 'Não foi possível salvar agora.');
  }
}

export async function deleteTemplate(id: string): Promise<TemplateActionResult> {
  if (!isUuid(id)) return { ok: false, message: 'Pedido inválido.' };
  const { token } = await context();
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  try {
    // Anamneses já enviadas guardam a própria cópia do questionário: apagar o modelo não as afeta.
    await directus().request(withToken(token, deleteItem('questionnaire_templates' as never, id)));
    revalidatePath('/app/questionarios');
    return { ok: true };
  } catch (error) {
    return failure(error, 'Não foi possível apagar agora.');
  }
}
