import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientAnamneses } from '@/components/patients/patient-anamneses';
import { PatientHeader } from '@/components/patients/patient-record';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import { listAnamneses } from '@/lib/anamneses/repository';
import { listTemplates } from '@/lib/questionnaires/repository';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { getPatient, listPatients } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Anamneses', robots: { index: false } };

export default async function PatientAnamnesesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/anamneses`);
  if (!isUuid(id)) notFound();

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;

  const [patient, all, anamneses] = await Promise.all([getPatient(id), organization ? listPatients(organization.id) : null, listAnamneses(id)]);
  const templates = await listTemplates();
  if (patient === undefined) notFound();
  const limit = getPlan(getUserPlan(organizations)).maxActivePatients;
  const activeLimitReached = limit !== null && (all ?? []).filter((p) => p.status === 'active').length >= limit;

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
            <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="anamneses" alerts={extractHealthAlerts(anamneses)} />
            <PatientAnamneses
              patientId={patient.id}
              patientFirstName={patient.full_name.split(/\s+/)[0] ?? patient.full_name}
              patientPhone={patient.phone}
              archived={patient.status !== 'active'}
              anamneses={anamneses}
              templates={templates ? templates.filter((t) => t.is_active).map((t) => ({ id: t.id, name: t.name, own: Boolean(t.organization_id) })) : null}
            />
          </>
        )}
      </main>
    </div>
  );
}
