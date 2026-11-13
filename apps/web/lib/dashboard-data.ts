import { readItems, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { listAppointments } from '@/lib/appointments/repository';
import { addDays, toInstant, today, type Appointment } from '@/lib/appointments/schema';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus, directusErrorInfo } from '@/lib/auth/directus';
import { listPatients } from '@/lib/patients/repository';
import { birthdaysAhead, withoutReturn, type DashAppointment } from './dashboard';

export interface PendingAnamnesis {
  id: string;
  title: string | null;
  answered_at: string | null;
  patient_id: { id: string; full_name: string } | null;
}

export interface Dashboard {
  todayDate: string;
  /** null = falha ao carregar aquela parte (as outras continuam aparecendo). */
  appointments: Appointment[] | null;
  pendingAnamneses: PendingAnamnesis[] | null;
  birthdays: ReturnType<typeof birthdaysAhead> | null;
  withoutReturn: ReturnType<typeof withoutReturn> | null;
  activePatients: number | null;
}

const RETURN_DAYS = 60;

async function read<T>(collection: string, query: Record<string, unknown>): Promise<T[] | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await directus().request<T[]>(withToken(token, readItems(collection as never, query as never)));
  } catch (error) {
    console.error(`dashboard: falha ao ler ${collection}`, directusErrorInfo(error));
    return null;
  }
}

/** Tudo o que o painel inicial mostra, em paralelo. */
export async function loadDashboard(organizationId: string, now = new Date()): Promise<Dashboard> {
  const day = today(now);
  const [appointments, pending, patients, history] = await Promise.all([
    listAppointments(organizationId, toInstant(day, '00:00'), toInstant(addDays(day, 1), '00:00')),
    read<PendingAnamnesis>('anamneses', {
      fields: ['id', 'title', 'answered_at', 'patient_id.id', 'patient_id.full_name'],
      filter: { _and: [{ organization_id: { _eq: organizationId } }, { status: { _eq: 'answered' } }] },
      sort: ['answered_at'],
      limit: 20,
    }),
    listPatients(organizationId),
    read<DashAppointment>('appointments', {
      fields: ['patient_id', 'starts_at', 'status'],
      filter: { _and: [{ organization_id: { _eq: organizationId } }, { starts_at: { _gte: new Date(now.getTime() - 400 * 86_400_000).toISOString() } }] },
      limit: 5000,
    }),
  ]);
  return {
    todayDate: day,
    appointments,
    pendingAnamneses: pending,
    birthdays: patients ? birthdaysAhead(patients, day) : null,
    withoutReturn: patients && history ? withoutReturn(patients, history, now, RETURN_DAYS) : null,
    activePatients: patients ? patients.filter((p) => p.status === 'active').length : null,
  };
}

export { RETURN_DAYS };
