import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientHeader } from '@/components/patients/patient-record';
import { PatientRecommendations } from '@/components/recommendations/patient-recommendations';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import { listAnamneses } from '@/lib/anamneses/repository';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { getPatient, listPatients } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';
import { listRecommendations } from '@/lib/recommendations/actions';
import { listSnippets } from '@/lib/snippets/actions';
import { pickClinicalOrg } from '@/lib/auth/clinical-org';

export const metadata: Metadata = { title: 'Recomendações', robots: { index: false } };

export default async function PatientRecommendationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/recomendacoes`);
  if (!isUuid(id)) notFound();
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = pickClinicalOrg(organizations);

  const [patient, all, recs, snippets, anamneses] = await Promise.all([
    getPatient(id),
    organization ? listPatients(organization.id) : null,
    listRecommendations(id),
    listSnippets(),
    listAnamneses(id),
  ]);
  if (patient === undefined || recs === undefined) notFound();
  const limit = getPlan(getUserPlan(organizations)).maxActivePatients;
  const activeLimitReached = limit !== null && (all ?? []).filter((p) => p.status === 'active').length >= limit;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        {patient === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar a ficha agora. Atualize a página em instantes.</AlertDescription></Alert>
        ) : (
          <>
            <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="recomendacoes" alerts={extractHealthAlerts(Array.isArray(anamneses) ? anamneses : [])} />
            {recs === null ? (
              <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar as recomendações agora.</AlertDescription></Alert>
            ) : (
              <PatientRecommendations patientId={patient.id} list={recs} snippets={snippets} archived={patient.status !== 'active'} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
