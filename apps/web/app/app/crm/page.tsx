import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { CrmBoard } from '@/components/crm/crm-board';
import { CrmMetrics } from '@/components/crm/crm-metrics';
import { CrmReturns } from '@/components/crm/crm-returns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { getBoard, getMetrics, getReturns } from '@/lib/crm/actions';
import { isSignupOpen } from '@/lib/flags';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'CRM', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS = [['funil', 'Funil'], ['retornos', 'Retornos'], ['indicadores', 'Indicadores']] as const;

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ aba?: string; janela?: string; dias?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/crm');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.aba) ? sp.aba! : 'funil';
  const window = ['overdue', '7', '30'].includes(sp.janela ?? '') ? sp.janela! : '';
  const days = [30, 90, 180, 365].includes(Number(sp.dias)) ? Number(sp.dias) : 90;
  const [board, returns, metrics] = await Promise.all([
    tab === 'funil' ? getBoard() : null,
    tab === 'retornos' ? getReturns(window) : null,
    tab === 'indicadores' ? getMetrics(days) : null,
  ]);

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-[96rem] space-y-6 px-5 py-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">CRM</h1>
        <nav aria-label="Seções do CRM" className="flex gap-1 border-b border-border">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/app/crm?aba=${k}`} aria-current={tab === k ? 'page' : undefined}
              className={cn('border-b-2 px-4 py-2.5 text-sm font-medium', tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{label}</Link>
          ))}
        </nav>
        {board ? (
          <CrmBoard board={board} />
        ) : returns ? (
          <CrmReturns data={returns} window={window} practice={organizations?.[0]?.name ?? 'consultório'} />
        ) : metrics ? (
          <CrmMetrics data={metrics} />
        ) : (
          <Alert variant="destructive"><AlertDescription>Não foi possível carregar o CRM agora. Atualize a página em instantes.</AlertDescription></Alert>
        )}
      </main>
    </div>
  );
}
