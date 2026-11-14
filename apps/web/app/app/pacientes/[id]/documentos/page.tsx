import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientHeader } from '@/components/patients/patient-record';
import { PatientDocuments } from '@/components/documents/patient-documents';
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
import { listDocuments, listDocumentTemplates } from '@/lib/documents/actions';

export const metadata: Metadata = { title: 'Documentos', robots: { index: false } };

export default async function PatientDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/documentos`);
  if (!isUuid(id)) notFound();
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;

  const [patient, all, docs, templates, anamneses] = await Promise.all([
    getPatient(id),
    organization ? listPatients(organization.id) : null,
    listDocuments(id),
    listDocumentTemplates(),
    listAnamneses(id),
  ]);
  if (patient === undefined || docs === undefined) notFound();
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
            <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="documentos" alerts={extractHealthAlerts(Array.isArray(anamneses) ? anamneses : [])} />
            {docs === null ? (
              <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar os documentos agora.</AlertDescription></Alert>
            ) : (
              <PatientDocuments patientId={patient.id} patientName={patient.full_name} list={docs} templates={templates} archived={patient.status !== 'active'} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
