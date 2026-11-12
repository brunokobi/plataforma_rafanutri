'use server';

import { createItem, isDirectusError, updateItem, withToken } from '@directus/sdk';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { directus } from '@/lib/auth/directus';
import { getMyOrganizations } from '@/lib/auth/organizations';
import { isUuid } from '@/lib/patients/schema';
import { getAppointment } from './repository';
import {
  appointmentFormSchema,
  OPEN_STATUSES,
  rescheduleSchema,
  toInstant,
  type AppointmentFormInput,
  type AppointmentStatus,
  type RescheduleInput,
} from './schema';

export type AppointmentActionResult = { ok: true; id?: string } | { ok: false; message: string };

const CLINICAL = new Set(['owner', 'nutritionist']);

function failure(error: unknown, fallback: string): AppointmentActionResult {
  if (isDirectusError(error)) {
    const status = error.response?.status;
    const message = error.errors?.[0]?.message ?? '';
    if (/Horário ocupado/.test(message)) return { ok: false, message };
    if (/não pode ser remarcada/.test(message)) return { ok: false, message: 'Consulta concluída ou cancelada não pode ser remarcada.' };
    if (status === 403) return { ok: false, message: 'Você não tem permissão para alterar a agenda deste consultório.' };
    if (status === 429) return { ok: false, message: 'Muitas tentativas seguidas. Aguarde um minuto.' };
    console.error('appointments: erro do Directus', { status, code: error.errors?.[0]?.extensions?.code });
  } else {
    console.error('appointments: erro inesperado', error);
  }
  return { ok: false, message: fallback };
}

async function context() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
  const org = (await getMyOrganizations())?.find((o) => CLINICAL.has(o.role)) ?? null;
  return { token, org };
}

function revalidate(patientId?: string) {
  revalidatePath('/app/agenda');
  if (patientId) revalidatePath(`/app/pacientes/${patientId}`);
}

export async function createAppointment(input: AppointmentFormInput): Promise<AppointmentActionResult> {
  const parsed = appointmentFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revise os campos.' };
  const { token, org } = await context();
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  if (!org) return { ok: false, message: 'Configure seu consultório antes de usar a agenda.' };

  const d = parsed.data;
  const startsAt = toInstant(d.date, d.time);
  const endsAt = new Date(Date.parse(startsAt) + d.duration * 60_000).toISOString();
  try {
    const created = await directus().request<{ id: string }>(
      withToken(
        token,
        createItem('appointments' as never, {
          organization_id: org.id,
          patient_id: d.patient_id,
          starts_at: startsAt,
          ends_at: endsAt,
          type: d.type,
          mode: d.mode,
          meeting_url: d.mode === 'online' ? (d.meeting_url ?? null) : null,
          notes: d.notes ?? null,
        } as never, { fields: ['id'] } as never),
      ),
    );
    revalidate(d.patient_id);
    return { ok: true, id: created.id };
  } catch (error) {
    return failure(error, 'Não foi possível marcar a consulta agora. Tente novamente em instantes.');
  }
}

export async function rescheduleAppointment(id: string, input: RescheduleInput): Promise<AppointmentActionResult> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!isUuid(id) || !parsed.success) return { ok: false, message: parsed.success ? 'Pedido inválido.' : (parsed.error.issues[0]?.message ?? 'Revise os campos.') };
  const { token } = await context();
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  const current = await getAppointment(id);
  if (!current) return { ok: false, message: 'Consulta não encontrada.' };
  if (!OPEN_STATUSES.includes(current.status) && current.status !== 'no_show') {
    return { ok: false, message: 'Consulta concluída ou cancelada não pode ser remarcada.' };
  }

  const startsAt = toInstant(parsed.data.date, parsed.data.time);
  const endsAt = new Date(Date.parse(startsAt) + parsed.data.duration * 60_000).toISOString();
  try {
    // Remarcar volta a consulta para "agendada" (a confirmação era do horário antigo).
    await directus().request(withToken(token, updateItem('appointments' as never, id, { starts_at: startsAt, ends_at: endsAt, status: 'scheduled' } as never)));
    revalidate(current.patient_id?.id);
    return { ok: true };
  } catch (error) {
    return failure(error, 'Não foi possível remarcar agora. Tente novamente em instantes.');
  }
}

const NEXT: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'completed', 'no_show', 'cancelled'],
  confirmed: ['scheduled', 'completed', 'no_show', 'cancelled'],
  no_show: [],
  completed: [],
  cancelled: [],
};

export async function setAppointmentStatus(id: string, status: AppointmentStatus): Promise<AppointmentActionResult> {
  if (!isUuid(id) || !(status in NEXT)) return { ok: false, message: 'Pedido inválido.' };
  const { token } = await context();
  if (!token) return { ok: false, message: 'Sua sessão expirou. Entre novamente.' };
  const current = await getAppointment(id);
  if (!current) return { ok: false, message: 'Consulta não encontrada.' };
  if (!NEXT[current.status].includes(status)) return { ok: false, message: 'Essa mudança não é possível para a consulta.' };
  try {
    await directus().request(withToken(token, updateItem('appointments' as never, id, { status } as never)));
    revalidate(current.patient_id?.id);
    return { ok: true };
  } catch (error) {
    return failure(error, 'Não foi possível atualizar a consulta agora.');
  }
}
