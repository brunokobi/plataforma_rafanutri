import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientRecord } from '@/components/patients/patient-record';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { listAssessments } from '@/lib/assessments/repository';
import { getPatient, listPatients } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Ficha do paciente', robots: { index: false } };

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}`);
  if (!isUuid(id)) notFound();

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);

  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;
  const [patient, all, assessments] = await Promise.all([getPatient(id), organization ? listPatients(organization.id) : null, listAssessments(id)]);
  if (patient === undefined) notFound();

  const limit = getPlan(getUserPlan(organizations)).maxActivePatients;
  const activeCount = (all ?? []).filter((p) => p.status === 'active').length;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-8">
        {patient === null ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>Não foi possível carregar a ficha agora. Atualize a página em instantes.</AlertDescription>
          </Alert>
        ) : (
          <PatientRecord patient={patient} activeLimitReached={limit !== null && activeCount >= limit} latestAssessment={Array.isArray(assessments) ? (assessments[0] ?? null) : null} />
        )}
      </main>
    </div>
  );
}
