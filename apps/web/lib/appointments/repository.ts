import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';
import type { Appointment } from './schema';

const FIELDS = ['id', 'patient_id.id', 'patient_id.full_name', 'starts_at', 'ends_at', 'type', 'mode', 'status', 'meeting_url', 'notes'];

/**
 * Consultas do consultório que começam no intervalo [from, to), com o token do usuário.
 * Null se não houver sessão ou o Directus falhar.
 */
export async function listAppointments(organizationId: string, fromIso: string, toIso: string): Promise<Appointment[] | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await directus().request<Appointment[]>(
      withToken(
        token,
        readItems('appointments' as never, {
          fields: FIELDS,
          filter: { _and: [{ organization_id: { _eq: organizationId } }, { starts_at: { _gte: fromIso } }, { starts_at: { _lt: toIso } }] },
          sort: ['starts_at'],
          limit: 500,
        } as never),
      ),
    );
  } catch (error) {
    console.error('appointments: falha ao listar', directusErrorInfo(error));
    return null;
  }
}

/** Consulta pelo id (só as do consultório do usuário; undefined se não existir/não for dele). */
export async function getAppointment(id: string): Promise<Appointment | null | undefined> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const rows = await directus().request<Appointment[]>(
      withToken(token, readItems('appointments' as never, { fields: FIELDS, filter: { id: { _eq: id } }, limit: 1 } as never)),
    );
    return rows[0];
  } catch (error) {
    console.error('appointments: falha ao ler', directusErrorInfo(error));
    return null;
  }
}

/** Próxima consulta marcada (agendada ou confirmada) do paciente, a partir de agora. */
export async function getNextAppointment(patientId: string): Promise<Appointment | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const rows = await directus().request<Appointment[]>(
      withToken(
        token,
        readItems('appointments' as never, {
          fields: FIELDS,
          filter: { _and: [{ patient_id: { _eq: patientId } }, { status: { _in: ['scheduled', 'confirmed'] } }, { starts_at: { _gte: new Date().toISOString() } }] },
          sort: ['starts_at'],
          limit: 1,
        } as never),
      ),
    );
    return rows[0] ?? null;
  } catch (error) {
    console.error('appointments: falha ao ler a próxima consulta', directusErrorInfo(error));
    return null;
  }
}

/** Todas as consultas do paciente (para a linha do tempo do prontuário), mais recentes primeiro. */
export async function listPatientAppointments(patientId: string): Promise<Appointment[] | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await directus().request<Appointment[]>(
      withToken(token, readItems('appointments' as never, { fields: FIELDS, filter: { patient_id: { _eq: patientId } }, sort: ['-starts_at'], limit: 300 } as never)),
    );
  } catch (error) {
    console.error('appointments: falha ao listar do paciente', directusErrorInfo(error));
    return null;
  }
}
