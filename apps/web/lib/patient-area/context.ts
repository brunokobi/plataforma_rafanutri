import { cookies } from 'next/headers';

/** Cookie com o registro (paciente × consultório) escolhido na área do paciente (RN-211). */
export const PATIENT_CONTEXT_COOKIE = 'rn_pc';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Registro pedido: ?c= na URL vence; senão o lembrado no cookie. O servidor confere que é da conta. */
export async function patientContextId(query?: string): Promise<string | undefined> {
  if (query && UUID.test(query)) return query;
  const saved = (await cookies()).get(PATIENT_CONTEXT_COOKIE)?.value;
  return saved && UUID.test(saved) ? saved : undefined;
}

/** Escolhe o registro: o pedido, se for da conta; senão o primeiro. `needsChoice` quando há vários e nada escolhido. */
export function pickRecord<T extends { patient_id: string }>(records: T[], wanted: string | undefined): { record: T | null; needsChoice: boolean } {
  const found = wanted ? records.find((r) => r.patient_id === wanted) : undefined;
  return { record: found ?? records[0] ?? null, needsChoice: !found && records.length > 1 };
}
