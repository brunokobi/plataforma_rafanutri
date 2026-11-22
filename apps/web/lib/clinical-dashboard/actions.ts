import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import type { PatientDashboard, PatientsDashboard } from './types';

async function get<T>(path: string): Promise<T | null> {
  const t = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!t) return null;
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
    if (!res.ok) return null;
    return ((await res.json()) as { data: T }).data;
  } catch {
    return null;
  }
}

/** Painel geral de todos os pacientes do consultório. Null se falhar. */
export const getPatientsDashboard = () => get<PatientsDashboard>('/clinical/patients-dashboard');

/** Painel de um paciente. Null se falhar ou não existir. */
export const getPatientDashboard = (patientId: string) =>
  /^[0-9a-f-]{36}$/i.test(patientId) ? get<PatientDashboard>(`/patients/${patientId}/dashboard`) : Promise.resolve(null);
