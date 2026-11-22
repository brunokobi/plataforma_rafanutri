import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getPublicHealthOverview } from '@/lib/public-health/actions';
import { CLASSIFICATION_LABEL, TOOL_LABEL } from '@/lib/public-health/types';
import { RISK_LABEL, type RiskLevel } from '@rafanutri/nutrition-core';

export const metadata: Metadata = { title: 'Saúde pública', robots: { index: false } };
export const dynamic = 'force-dynamic';

const RISK_VARIANT = { low: 'outline', medium: 'secondary', high: 'destructive' } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** Saúde pública — painel de risco nutricional do consultório (bloco A: triagens). */
export default async function PublicHealthPage({ searchParams }: { searchParams: Promise<{ risco?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/saude-publica');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const data = await getPublicHealthOverview();
  const sp = await searchParams;
  const filter: RiskLevel | null = sp.risco === 'high' || sp.risco === 'medium' ? sp.risco : null;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Saúde pública</h1>
          <p className="text-muted-foreground">Triagem nutricional dos pacientes (NRS-2002, MUST e ASG) e quem está em risco. Programas, indicadores coletivos e relatórios por território chegam nas próximas entregas.</p>
        </div>
        {data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar agora. Atualize a página em instantes.</AlertDescription></Alert>
        ) : !data.allowed ? (
          <div className="space-y-2 rounded-lg border p-6">
            <p className="text-sm text-muted-foreground">O módulo Saúde pública é habilitado por contrato.</p>
            <Link href="/app/configuracoes/plano" className="text-sm font-medium text-primary hover:underline">Falar com a equipe</Link>
          </div>
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Pacientes ativos" value={data.active_patients} />
              <Stat label="Já triados" value={data.screened_patients} />
              <Stat label="Triagens em 30 dias" value={data.screenings_30d} />
              <Stat label="Risco médio" value={data.by_risk.medium} />
              <Stat label="Risco alto" value={data.by_risk.high} tone="text-destructive" />
            </dl>
            <section aria-labelledby="at-risk" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="at-risk" className="font-display text-xl font-semibold">Pacientes em risco</h2>
                <nav aria-label="Filtrar por risco" className="ml-auto flex gap-2 text-sm">
                  {([[null, 'Todos'], ['high', 'Alto'], ['medium', 'Médio']] as const).map(([k, label]) => (
                    <Link key={label} href={k ? `?risco=${k}` : '?'} aria-current={filter === k ? 'page' : undefined}
                      className={`inline-flex min-h-9 items-center rounded-full border px-3 ${filter === k ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground'}`}>{label}</Link>
                  ))}
                </nav>
              </div>
              <p className="text-sm text-muted-foreground">Pela última triagem de cada paciente ativo.</p>
              {data.at_risk.filter((r) => !filter || r.risk_level === filter).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum paciente {filter ? `com ${RISK_LABEL[filter].toLowerCase()}` : 'em risco'} na última triagem.</p>
              ) : (
                <ul aria-label="Pacientes em risco" className="divide-y rounded-lg border">
                  {data.at_risk.filter((r) => !filter || r.risk_level === filter).map((r) => (
                    <li key={r.patient_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                      <Link href={`/app/pacientes/${r.patient_id}/triagens`} className="font-medium text-primary hover:underline">{r.full_name}</Link>
                      <span>{TOOL_LABEL[r.tool]}: {CLASSIFICATION_LABEL[r.classification] ?? r.classification}</span>
                      <Badge variant={RISK_VARIANT[r.risk_level]}>{RISK_LABEL[r.risk_level]}</Badge>
                      <span className="ml-auto text-muted-foreground tabular-nums">{day(r.screened_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-display text-2xl font-semibold tabular-nums ${tone}`}>{value.toLocaleString('pt-BR')}</dd>
    </div>
  );
}
