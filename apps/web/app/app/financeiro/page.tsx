import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { FinanceView } from '@/components/finance/finance-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PracticeLocked } from '@/components/app/practice-locked';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { hasPracticeModule } from '@/lib/modules/practice';
import { getCurrentUser } from '@/lib/auth/session';
import { getAppointmentPrefill, getFinanceCategories, getFinanceSummary, getTransactions } from '@/lib/finance/actions';
import { monthRange } from '@/lib/finance/types';
import { isSignupOpen } from '@/lib/flags';
import { listPatients } from '@/lib/patients/repository';

export const metadata: Metadata = { title: 'Financeiro', robots: { index: false } };
export const dynamic = 'force-dynamic';

const thisMonth = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ mes?: string; consulta?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/financeiro');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  if (!hasPracticeModule(organizations)) return <PracticeLocked title="Financeiro" />;
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? '') ? sp.mes! : thisMonth();
  const { from, to } = monthRange(month);
  const org = organizations?.[0] ?? null;

  const [list, summary, categories, patients, prefill] = await Promise.all([
    getTransactions(from, to),
    getFinanceSummary(month),
    getFinanceCategories(),
    org ? listPatients(org.id) : null,
    sp.consulta ? getAppointmentPrefill(sp.consulta) : null,
  ]);

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-8">
        {!list || !categories ? (
          <Alert variant="destructive"><AlertDescription>Não foi possível carregar o financeiro agora. Atualize a página em instantes.</AlertDescription></Alert>
        ) : (
          <FinanceView key={month} month={month} list={list} summary={summary} categories={categories} prefill={prefill}
            patients={(patients ?? []).filter((p) => p.status !== 'archived').map((p) => ({ id: p.id, full_name: p.full_name }))} />
        )}
      </main>
    </div>
  );
}
