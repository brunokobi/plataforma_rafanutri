'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPatientArea } from './actions';
import { PATIENT_CONTEXT_COOKIE } from './context';

/** Lembra o nutricionista escolhido (só aceita registro ligado à conta) e volta ao início. */
export async function choosePatientRecord(formData: FormData): Promise<void> {
  const id = String(formData.get('patient_id') ?? '');
  const area = await getPatientArea();
  if (!area?.records.some((r) => r.patient_id === id)) redirect('/p/nutricionistas');
  (await cookies()).set(PATIENT_CONTEXT_COOKIE, id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/p', maxAge: 365 * 24 * 3600 });
  redirect('/p');
}
