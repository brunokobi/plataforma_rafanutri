import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientAssessments } from '@/components/patients/patient-assessments';
import { PatientHeader } from '@/components/patients/patient-record';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import { listAnamneses } from '@/lib/anamneses/repository';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { listAssessments } from '@/lib/assessments/repository';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { getPatient, listPatients } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Avaliações', robots: { index: false } };

export default async function PatientAssessmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/avaliacoes`);
  if (!isUuid(id)) notFound();

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;

  const [patient, all, assessments] = await Promise.all([getPatient(id), organization ? listPatients(organization.id) : null, listAssessments(id)]);
  if (patient === undefined) notFound();
  const alerts = extractHealthAlerts(await listAnamneses(id));
  const limit = getPlan(getUserPlan(organizations)).maxActivePatients;
  const activeLimitReached = limit !== null && (all ?? []).filter((p) => p.status === 'active').length >= limit;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8">
        {patient === null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>Não foi possível carregar a ficha agora. Atualize a página em instantes.</AlertDescription>
          </Alert>
        ) : (
          <>
            <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="avaliacoes" alerts={alerts} />
            <PatientAssessments patient={patient} assessments={assessments} />
          </>
        )}
      </main>
    </div>
  );
}
