import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { PatientsDashboard } from '@/components/clinical/patients-dashboard';
import { PatientsList } from '@/components/clinical/patients-list';
import { getPatientsDashboard } from '@/lib/clinical-dashboard/actions';
import { REASONS, type AttentionReason } from '@/lib/clinical-dashboard/types';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getPlan } from '@/lib/modules/plans';
import { getUserPlan } from '@/lib/modules/user-plan';
import { listPatients } from '@/lib/patients/repository';

export const metadata: Metadata = { title: 'Pacientes', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; atencao?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/pacientes');

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);

  const organization = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;
  const plan = getPlan(getUserPlan(organizations));
  const [patients, dashboard] = organization ? await Promise.all([listPatients(organization.id), getPatientsDashboard()]) : [null, null];
  const sp = await searchParams;
  const reason = REASONS.includes(sp.atencao as AttentionReason) ? (sp.atencao as AttentionReason) : null;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 80) : '';

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Pacientes</h1>
        {organization && <p className="mt-1 text-sm text-muted-foreground">{organization.name}</p>}
        {dashboard && (
          <div className="mt-6">
            <PatientsDashboard data={dashboard} reason={reason} />
          </div>
        )}
        <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight">Todos os pacientes</h2>
        <div className="mt-4">
          <PatientsList patients={patients} limit={plan.maxActivePatients} planName={plan.name} demoHref="/app/pacientes/exemplo" key={q} initialQuery={q} />
        </div>
      </main>
    </div>
  );
}
