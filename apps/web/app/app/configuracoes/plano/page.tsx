import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app/app-header';
import { WaitlistForm } from '@/components/plan/waitlist-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { MODULES } from '@/lib/modules/catalog';
import { getPlan, type PlanCode } from '@/lib/modules/plans';
import { getPlanUsage } from '@/lib/plan/actions';
import { getEntitlements, seatsInfo, seatsMessage } from '@/lib/plan/seats';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Meu plano', robots: { index: false } };

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const { level } = seatsInfo(used, limit);
  return (
    <div>
      <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{used}{limit !== null ? ` de ${limit}` : ''}</span> {label}</p>
      {limit !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${used} de ${limit} ${label}`}>
          <div className={cn('h-full rounded-full', level === 'full' ? 'bg-tomato' : level === 'warning' ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export default async function PlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/configuracoes/plano');
  const target = landingRedirect('app', await getMyOrganizations(), isSignupOpen());
  if (target) redirect(target);
  const data = await getPlanUsage();
  const code = (data?.plan.code ?? 'free') as PlanCode;
  const plan = getPlan(code);
  const ent = getEntitlements(code);
  const warn = data ? seatsMessage(data.usage.active_patients, data.plan.max_active_patients) : null;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-8 px-5 py-10">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Meu plano</h1>
          <p className="mt-2 text-muted-foreground">Plano <strong className="text-foreground">{data?.plan.name ?? plan.name}</strong>, permanente e sem cartão.</p>
        </div>
        {!data ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar o uso do plano agora.</AlertDescription></Alert>
        ) : (
          <section aria-labelledby="uso" className="space-y-5 rounded-2xl border border-border bg-card p-5">
            <h2 id="uso" className="font-display text-xl font-semibold">Uso</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Meter label="pacientes ativos" used={data.usage.active_patients} limit={data.plan.max_active_patients} />
              <Meter label="profissionais" used={data.usage.members} limit={data.plan.max_members} />
            </div>
            <p className="text-sm text-muted-foreground">
              {data.usage.archived_patients} {data.usage.archived_patients === 1 ? 'paciente arquivado' : 'pacientes arquivados'} (não contam no limite). Arquivar libera a vaga; reativar ocupa de novo.
            </p>
            {warn && (
              <Alert><AlertCircle /><AlertDescription>{warn} <Link href="/app/pacientes" className="font-medium text-primary hover:underline">Ver pacientes</Link></AlertDescription></Alert>
            )}
          </section>
        )}
        <section aria-labelledby="incluso" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="incluso" className="font-display text-xl font-semibold">O que está incluído</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {MODULES.filter((m) => ent.modules.includes(m.code)).map((m) => (
              <li key={m.code}><span className="font-medium">{m.name}</span>{plan.grants[m.code].note ? <span className="text-muted-foreground"> · {plan.grants[m.code].note}</span> : null}</li>
            ))}
          </ul>
        </section>
        {code === 'free' && (
          <section id="interesse" aria-labelledby="pago" className="rounded-2xl border border-border bg-card p-5">
            <h2 id="pago" className="font-display text-xl font-semibold">Plano pago</h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Os planos pagos ainda não abriram. Registre seu interesse e avisamos quando estiverem disponíveis.</p>
            <WaitlistForm registeredAt={data?.waitlist?.date_created ?? null} initialPlan={data?.waitlist?.desired_plan ?? null} canRegister={data?.role === 'owner'} />
          </section>
        )}
      </main>
    </div>
  );
}
