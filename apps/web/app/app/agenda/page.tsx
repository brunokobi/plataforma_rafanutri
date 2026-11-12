import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AgendaWeek } from '@/components/agenda/agenda-week';
import { AppHeader } from '@/components/app/app-header';
import { listAppointments } from '@/lib/appointments/repository';
import { addDays, isDate, today, toInstant, weekStart } from '@/lib/appointments/schema';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listPatients } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Agenda', robots: { index: false } };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ semana?: string; paciente?: string }> }) {
  const { semana, paciente } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/agenda');

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;

  const todayDate = today();
  const start = weekStart(isDate(semana) ? semana : todayDate);
  const [appointments, patients] = organization
    ? await Promise.all([
        // Uma semana a mais nas pontas não é necessária: a semana vai de segunda 00:00 a segunda 00:00 (Brasília).
        listAppointments(organization.id, toInstant(start, '00:00'), toInstant(addDays(start, 7), '00:00')),
        listPatients(organization.id),
      ])
    : [null, null];
  const options = (patients ?? []).filter((p) => p.status === 'active').map((p) => ({ id: p.id, full_name: p.full_name }));
  const defaultPatientId = isUuid(paciente) && options.some((p) => p.id === paciente) ? paciente : undefined;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Agenda</h1>
        {organization && <p className="mt-1 text-sm text-muted-foreground">{organization.name} · horário de Brasília</p>}
        <div className="mt-6">
          <AgendaWeek start={start} todayDate={todayDate} appointments={appointments} patients={options} defaultPatientId={defaultPatientId} />
        </div>
      </main>
    </div>
  );
}
