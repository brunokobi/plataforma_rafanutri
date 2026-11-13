import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientChart } from '@/components/notes/patient-chart';
import { PatientHeader } from '@/components/patients/patient-record';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import { listAnamneses } from '@/lib/anamneses/repository';
import { listPatientAppointments } from '@/lib/appointments/repository';
import { listAssessments } from '@/lib/assessments/repository';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listMealPlans } from '@/lib/meal-plans/repository';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { listNotes } from '@/lib/notes/actions';
import { buildTimeline } from '@/lib/notes/timeline';
import { getPatient, listPatients } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Prontuário', robots: { index: false } };

export default async function PatientChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/prontuario`);
  if (!isUuid(id)) notFound();

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;

  const [patient, all, notes, appointments, anamneses, assessments, plans] = await Promise.all([
    getPatient(id),
    organization ? listPatients(organization.id) : null,
    listNotes(id),
    listPatientAppointments(id),
    listAnamneses(id),
    listAssessments(id),
    listMealPlans(id),
  ]);
  if (patient === undefined || notes === undefined) notFound();
  const limit = getPlan(getUserPlan(organizations)).maxActivePatients;
  const activeLimitReached = limit !== null && (all ?? []).filter((p) => p.status === 'active').length >= limit;
  const ok = <T,>(v: T[] | null | 'unavailable'): T[] | null => (Array.isArray(v) ? v : null);
  const failed = [notes, appointments, anamneses, ok(assessments), ok(plans)].some((v) => v === null);

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        {patient === null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>Não foi possível carregar a ficha agora. Atualize a página em instantes.</AlertDescription>
          </Alert>
        ) : (
          <>
            <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="prontuario" alerts={extractHealthAlerts(anamneses ?? [])} />
            {failed && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>Parte do histórico não carregou agora; a linha do tempo pode estar incompleta.</AlertDescription>
              </Alert>
            )}
            <PatientChart
              patientId={patient.id}
              archived={patient.status !== 'active'}
              notesUnavailable={notes === null}
              events={buildTimeline(patient.id, { notes, appointments, anamneses, assessments: ok(assessments), plans: ok(plans) })}
            />
          </>
        )}
      </main>
    </div>
  );
}
