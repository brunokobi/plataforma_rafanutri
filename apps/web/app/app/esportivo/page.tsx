import { Activity, Dumbbell, Flame, Timer, Trophy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app/app-header';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { isAthlete } from '@/lib/modules/theme';
import { listPatients } from '@/lib/patients/repository';
import { ageInYears } from '@/lib/patients/schema';

export const metadata: Metadata = { title: 'Esportivo', robots: { index: false } };
export const dynamic = 'force-dynamic';

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-accent" />
      <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><span aria-hidden="true" className="text-primary">{icon}</span>{label}</dt>
      <dd className="mt-1 font-display text-4xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/** Esportivo: atletas e praticantes (pelo objetivo do paciente), com o visual esportivo. */
export default async function SportHome() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/esportivo');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const org = organizations?.find((o) => o.role === 'owner' || o.role === 'nutritionist') ?? null;
  const patients = org ? await listPatients(org.id) : null;
  const athletes = (patients ?? []).filter((p) => p.status === 'active' && isAthlete(p.objective));
  const byGoal = (re: RegExp) => athletes.filter((a) => re.test(a.objective ?? '')).length;

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <div className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8">
          <span aria-hidden="true" className="absolute -right-10 top-0 h-full w-48 -skew-x-12 bg-accent/80" />
          <span aria-hidden="true" className="absolute right-28 top-0 h-full w-6 -skew-x-12 bg-accent/50" />
          <p className="relative flex items-center gap-2 text-sm font-semibold uppercase tracking-widest"><Dumbbell className="size-5" aria-hidden="true" /> Esportivo</p>
          <h1 className="relative mt-2 font-display text-5xl font-bold uppercase tracking-tight">Alta performance</h1>
          <p className="relative mt-2 max-w-xl opacity-90">Atletas e praticantes: composição corporal, plano para treino e competição e evolução de cada um.</p>
        </div>
        {patients === null ? (
          <p className="text-sm text-destructive">Não foi possível carregar os pacientes agora.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={<Trophy className="size-4" />} label="Atletas ativos" value={athletes.length} />
              <Kpi icon={<Dumbbell className="size-4" />} label="Hipertrofia" value={byGoal(/hipertrofia|massa/i)} />
              <Kpi icon={<Timer className="size-4" />} label="Endurance" value={byGoal(/corrida|maratona|triatl|ciclis|nata/i)} />
              <Kpi icon={<Flame className="size-4" />} label="Competição" value={byGoal(/competi|atleta/i)} />
            </dl>
            <section aria-labelledby="atletas" className="space-y-3">
              <h2 id="atletas" className="font-display text-2xl font-bold uppercase tracking-tight">Atletas</h2>
              {athletes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Nenhum atleta ainda. Um paciente aparece aqui quando o objetivo dele cita esporte, treino, hipertrofia, corrida, competição ou a modalidade (edite o objetivo na ficha).
                </p>
              ) : (
                <ul aria-label="Atletas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {athletes.map((a) => (
                    <li key={a.id}>
                      <Link href={`/app/pacientes/${a.id}`} className="block h-full rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary">
                        <span className="flex items-center gap-2 font-semibold"><Activity className="size-4 text-primary" aria-hidden="true" />{a.full_name}</span>
                        <span className="mt-1 block text-sm text-muted-foreground">{a.birth_date ? `${ageInYears(a.birth_date)} anos · ` : ''}{a.objective}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">A ficha de um atleta abre com o visual esportivo. Avaliação corporal (dobras, protocolos de Jackson & Pollock e ISAK) e plano com metas de proteína por kg ficam na ficha.</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
