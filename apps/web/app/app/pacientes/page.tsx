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
import { pickClinicalOrg } from '@/lib/auth/clinical-org';

export const metadata: Metadata = { title: 'Pacientes', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; atencao?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/pacientes');

  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);

  const organization = pickClinicalOrg(organizations);
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
        {/* No celular, a lista vem primeiro; o painel fica embaixo. No computador, painel e depois a lista. */}
        <div className="mt-6 flex flex-col">
          {dashboard && (
            <div className="order-2 mt-10 lg:order-1 lg:mt-0">
              <PatientsDashboard data={dashboard} reason={reason} />
            </div>
          )}
          <div className="order-1 lg:order-2 lg:mt-10">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Todos os pacientes</h2>
            <div className="mt-4">
              <PatientsList patients={patients} limit={plan.maxActivePatients} planName={plan.name} demoHref="/app/pacientes/exemplo" key={q} initialQuery={q} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
