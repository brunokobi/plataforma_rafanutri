import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientAppAccess } from '@/components/patients/patient-app-access';
import { PatientNotifications } from '@/components/notifications/patient-notifications';
import { getPatientContactPrefs } from '@/lib/notifications/actions';
import { PatientShareSettings } from '@/components/patients/patient-share-settings';
import { PatientPackages } from '@/components/packages/patient-packages';
import { listPackages, listPatientPackages } from '@/lib/packages/actions';
import { PatientRecipes } from '@/components/recipes/patient-recipes';
import { PatientRecord } from '@/components/patients/patient-record';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import { listAnamneses } from '@/lib/anamneses/repository';
import { getNextAppointment } from '@/lib/appointments/repository';
import { getPatientDashboard } from '@/lib/clinical-dashboard/actions';
import { listAssessments } from '@/lib/assessments/repository';
import { listMealPlans } from '@/lib/meal-plans/repository';
import { getAppAccess, getShareConfig } from '@/lib/patient-area/actions';
import { getPatient, listPatients } from '@/lib/patients/repository';
import { listPatientRecipes, listRecipes } from '@/lib/recipes/actions';
import { isUuid } from '@/lib/patients/schema';
import { pickClinicalOrg } from '@/lib/auth/clinical-org';
import { PlanSuggestions } from '@/components/meal-plans/plan-suggestions';
import { patientSuggestions } from '@/lib/meal-plans/suggestions-data';
import { PatientTrackingPanel } from '@/components/tracking/patient-tracking-panel';
import { getPatientTracking } from '@/lib/tracking/actions';

export const metadata: Metadata = { title: 'Ficha do paciente', robots: { index: false } };

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/pacientes/${encodeURIComponent(id)}`);
  if (!isUuid(id)) notFound();

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);

  const organization = pickClinicalOrg(organizations);
  const [patient, all, assessments, plans, anamneses, nextAppointment, appAccess, patientRecipes, library, shareConfig, patientPackages, packageCatalog, contactPrefs, dashboard, tracking] = await Promise.all([
    getPatient(id),
    organization ? listPatients(organization.id) : null,
    listAssessments(id),
    listMealPlans(id),
    listAnamneses(id),
    getNextAppointment(id),
    getAppAccess(id),
    listPatientRecipes(id),
    listRecipes(),
    getShareConfig(id),
    listPatientPackages(id),
    listPackages(),
    getPatientContactPrefs(id),
    getPatientDashboard(id),
    getPatientTracking(id),
  ]);
  if (patient === undefined) notFound();
  const suggestions = patient && patient.status === 'active' ? await patientSuggestions(patient, { assessments, anamneses, plans }).catch(() => null) : null;

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
          <PatientRecord patient={patient} activeLimitReached={limit !== null && activeCount >= limit} latestAssessment={Array.isArray(assessments) ? (assessments[0] ?? null) : null}
            previousAssessment={Array.isArray(assessments) ? (assessments[1] ?? null) : null}
            nextAppointment={nextAppointment}
            alerts={extractHealthAlerts(anamneses)}
            publishedPlan={Array.isArray(plans) ? (plans.find((p) => p.status === 'published') ?? null) : null}
            dashboard={dashboard}
          />
        )}
        {patient && suggestions && (
          <div className="mt-6">
            <PlanSuggestions patientId={patient.id} suggestions={suggestions.suggestions} target={suggestions.target} />
          </div>
        )}
        {patient && tracking && (
          <div className="mt-6">
            <PatientTrackingPanel t={tracking} linked={Boolean(appAccess?.linked)} />
          </div>
        )}
        {patient && (
          <div className="mt-6">
            <PatientAppAccess patientId={patient.id} access={appAccess} firstName={patient.full_name.split(/\s+/)[0] ?? patient.full_name} phone={patient.phone} />
          </div>
        )}
        {patient && patient.status === 'active' && (
          <div className="mt-6">
            <PatientNotifications patientId={patient.id} prefs={contactPrefs} firstName={patient.full_name.split(/\s+/)[0] ?? patient.full_name} />
          </div>
        )}
        {patient && (
          <div className="mt-6">
            <PatientPackages patientId={patient.id} list={patientPackages} catalog={packageCatalog} archived={patient.status !== 'active'} />
          </div>
        )}
        {patient && (
          <div className="mt-6">
            <PatientShareSettings patientId={patient.id} config={shareConfig} edDetected={tracking?.share.ed_detected ?? false} />
          </div>
        )}
        {patient && patient.status === 'active' && (
          <div className="mt-6">
            <PatientRecipes patientId={patient.id} rows={patientRecipes} library={library} hasAppAccess={Boolean(appAccess?.linked)} />
          </div>
        )}
      </main>
    </div>
  );
}
