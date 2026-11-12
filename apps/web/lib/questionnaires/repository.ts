import type { Questionnaire } from '@rafanutri/forms';
import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';

export interface QuestionnaireTemplate {
  id: string;
  organization_id: string | null; // null = modelo padrão da plataforma
  name: string;
  description: string | null;
  schema: Questionnaire;
  version: number;
  is_active: boolean;
  date_updated: string | null;
}

const FIELDS = ['id', 'organization_id', 'name', 'description', 'schema', 'version', 'is_active', 'date_updated'];

async function token() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

/** Modelos padrão + os do consultório do usuário (as permissões do Directus filtram). */
export async function listTemplates(): Promise<QuestionnaireTemplate[] | null> {
  const t = await token();
  if (!t) return null;
  try {
    const rows = await directus().request<QuestionnaireTemplate[]>(
      withToken(t, readItems('questionnaire_templates' as never, { fields: FIELDS, sort: ['name'], limit: 200 } as never)),
    );
    // Do consultório primeiro, depois os padrões.
    return [...rows.filter((r) => r.organization_id), ...rows.filter((r) => !r.organization_id)];
  } catch (error) {
    console.error('questionnaires: falha ao listar', directusErrorInfo(error));
    return null;
  }
}

export async function getTemplate(id: string): Promise<QuestionnaireTemplate | null | undefined> {
  const t = await token();
  if (!t) return null;
  try {
    const rows = await directus().request<QuestionnaireTemplate[]>(
      withToken(t, readItems('questionnaire_templates' as never, { fields: FIELDS, filter: { id: { _eq: id } }, limit: 1 } as never)),
    );
    return rows[0];
  } catch (error) {
    console.error('questionnaires: falha ao ler', directusErrorInfo(error));
    return null;
  }
}
