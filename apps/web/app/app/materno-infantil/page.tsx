import { AlertCircle, AlertTriangle, Baby, HeartHandshake, Milk, Sprout } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/app/app-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getMyOrganizations, landingRedirect } from '@/lib/auth/organizations';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';
import { getMaternalOverview } from '@/lib/maternal/actions';
import { ALLERGENS, FEEDING_TYPE_LABEL, monthsBetween } from '@/lib/maternal/feeding';
import type { FeedingType } from '@/lib/maternal/types';
import { ageLabel, weeksLabel } from '@/lib/maternal/view';
import { dueDate, gestationalWeeks } from '@rafanutri/nutrition-core';
import { ageInDays } from '@rafanutri/nutrition-core/growth';

export const metadata: Metadata = { title: 'Materno-infantil', robots: { index: false } };
export const dynamic = 'force-dynamic';

const dateBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const tab = (id: string) => `/app/pacientes/${id}/materno-infantil`;

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground"><span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-secondary text-primary">{icon}</span>{label}</dt>
      <dd className="mt-2 font-display text-3xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function Box({ title, icon, empty, children }: { title: string; icon: ReactNode; empty: string; children: ReactNode[] }) {
  return (
    <section aria-label={title} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold"><span aria-hidden="true" className="text-primary">{icon}</span>{title}</h2>
      {children.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{empty}</p> : <ul className="mt-3 divide-y divide-border">{children}</ul>}
    </section>
  );
}

/** Entrada do módulo Materno-infantil: crianças, gestantes, lactantes e reações recentes. */
export default async function MaternalHome() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/app/materno-infantil');
  const organizations = await getMyOrganizations();
  const target = landingRedirect('app', organizations, isSignupOpen());
  if (target) redirect(target);
  const data = await getMaternalOverview();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <div className="rounded-[2rem] border border-border bg-gradient-to-br from-secondary via-card to-accent p-6 shadow-sm sm:p-8">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Baby className="size-5" aria-hidden="true" /> Materno-infantil</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Crescer com cuidado</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Curvas de crescimento, gestação, amamentação e introdução alimentar dos seus pacientes, num só lugar.</p>
        </div>
        {data === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar agora. Atualize a página em instantes.</AlertDescription></Alert>
        ) : !data.allowed ? (
          <div className="space-y-2 rounded-3xl border p-6">
            <p className="text-sm text-muted-foreground">O módulo Materno-infantil faz parte dos planos Profissional e Clínica.</p>
            <Link href="/app/configuracoes/plano" className="text-sm font-medium text-primary hover:underline">Ver planos</Link>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={<Baby className="size-4" />} label="Crianças até 10 anos" value={data.children.length} />
              <Kpi icon={<HeartHandshake className="size-4" />} label="Gestantes" value={data.pregnancies.length} />
              <Kpi icon={<Milk className="size-4" />} label="Lactantes" value={data.lactations.length} />
              <Kpi icon={<AlertTriangle className="size-4" />} label="Reações em 60 dias" value={data.reactions.length} />
            </dl>
            {data.reactions.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertDescription>
                  <ul className="space-y-1">
                    {data.reactions.map((r) => (
                      <li key={`${r.id}-${r.item}`}>
                        <Link href={tab(r.id)} className="font-medium underline">{r.full_name}</Link>: reação {r.reaction === 'severe' ? 'grave' : 'moderada'} a {ALLERGENS.find((a) => a.code === r.item)?.label.toLowerCase() ?? r.item} ({dateBR(r.introduced_on)}{r.by_guardian ? ', registrada pelo responsável' : ''})
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-5 lg:grid-cols-2">
              <Box title="Gestantes" icon={<HeartHandshake className="size-5" />} empty="Nenhuma gestação em acompanhamento. Abra pela aba Materno-infantil da ficha da paciente.">
                {data.pregnancies.map((g) => {
                  const w = gestationalWeeks(g.lmp_date, today);
                  return (
                    <li key={g.id} className="flex flex-wrap items-center gap-x-3 py-2.5 text-sm">
                      <Link href={tab(g.id)} className="font-medium text-primary hover:underline">{g.full_name}</Link>
                      <span>{w <= 44 ? weeksLabel(w) : '—'}</span>
                      <span className="ml-auto text-muted-foreground">DPP {dateBR(dueDate(g.lmp_date))}</span>
                    </li>
                  );
                })}
              </Box>
              <Box title="Amamentação" icon={<Milk className="size-5" />} empty="Nenhuma lactação registrada.">
                {data.lactations.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 py-2.5 text-sm">
                    <Link href={tab(l.id)} className="font-medium text-primary hover:underline">{l.full_name}</Link>
                    <span className="text-muted-foreground">{FEEDING_TYPE_LABEL[l.feeding_type as FeedingType]?.split(' (')[0] ?? l.feeding_type}</span>
                    <span className="ml-auto text-muted-foreground">{Math.max(0, Math.floor(monthsBetween(l.started_on, today)))} meses pós-parto{l.baby_name ? ` · ${l.baby_name}` : ''}</span>
                  </li>
                ))}
              </Box>
            </div>
            <Box title="Crianças" icon={<Sprout className="size-5" />} empty="Nenhuma criança até 10 anos entre os pacientes ativos.">
              {data.children.map((c) => {
                const days = ageInDays(c.birth_date, today);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 py-2.5 text-sm">
                    <Link href={tab(c.id)} className="font-medium text-primary hover:underline">{c.full_name}</Link>
                    <span className="text-muted-foreground">{ageLabel(days)}</span>
                    {days < 730 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">introdução alimentar</span>}
                  </li>
                );
              })}
            </Box>
          </>
        )}
      </main>
    </div>
  );
}
