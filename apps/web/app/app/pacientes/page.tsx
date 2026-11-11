import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientsList } from '@/components/clinical/patients-list';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { listPatients } from '@/lib/patients/repository';

export const metadata: Metadata = { title: 'Pacientes', robots: { index: false } };

export default async function PatientsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/pacientes');

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);

  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;
  const plan = getPlan(getUserPlan(organizations));
  const patients = organization ? await listPatients(organization.id) : null;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Pacientes</h1>
        {organization && <p className="mt-1 text-sm text-muted-foreground">{organization.name}</p>}
        <div className="mt-6">
          <PatientsList patients={patients} limit={plan.maxActivePatients} planName={plan.name} demoHref="/app/pacientes/exemplo" />
        </div>
      </main>
    </div>
  );
}
