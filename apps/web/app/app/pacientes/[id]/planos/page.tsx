import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientPlans } from '@/components/patients/patient-plans';
import { PatientHeader } from '@/components/patients/patient-record';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import { listAnamneses } from '@/lib/anamneses/repository';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { listMealPlans } from '@/lib/meal-plans/repository';
import { listPlanTemplates } from '@/lib/meal-plans/templates';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { getPatient, listPatients } from '@/lib/patients/repository';
import { isUuid } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Planos alimentares', robots: { index: false } };

export default async function PatientPlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}/planos`);
  if (!isUuid(id)) notFound();

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;

  const [patient, all, plans, templates] = await Promise.all([getPatient(id), organization ? listPatients(organization.id) : null, listMealPlans(id), listPlanTemplates()]);
  const templateOptions = Array.isArray(templates) ? templates.map((t) => ({ id: t.id, name: t.name, energy_kcal: t.energy_kcal, own: Boolean(t.organization_id) })) : [];
  if (patient === undefined) notFound();
  const alerts = extractHealthAlerts(await listAnamneses(id));
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
            <PatientHeader patient={patient} activeLimitReached={activeLimitReached} active="planos" alerts={alerts} />
            <PatientPlans patientId={patient.id} plans={plans} templates={templateOptions} />
          </>
        )}
      </main>
    </div>
  );
}
