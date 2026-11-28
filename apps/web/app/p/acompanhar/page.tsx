import { CalendarClock, HeartHandshake, Ruler, Target, TrendingDown, TrendingUp, UtensilsCrossed } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { BmiGauge, WaterBars, WeightTrend } from '@/components/tracking/charts';
import { GoalsChecklist, MealChecklist } from '@/components/tracking/checklists';
import { WaterReminders, WaterTracker } from '@/components/tracking/water-tracker';
import { WeightLogger, WeightLogList } from '@/components/tracking/weight-logger';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { patientContextId } from '@/lib/patient-area/context';
import { getPatientArea } from '@/lib/patient-area/actions';
import { getMyTracking } from '@/lib/tracking/actions';
import { dayShort, kg, mealAdherence, toTarget, weightChange, weightSeries } from '@/lib/tracking/types';

export const metadata: Metadata = { title: 'Meu progresso', robots: { index: false } };
export const dynamic = 'force-dynamic';

const SEX = { female: 'Feminino', male: 'Masculino' } as const;
const num = (n: number, d = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: d });

function Card({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="flex-1 font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Painel do próprio paciente: perfil, peso (casa e consultório), água, metas, refeições e consultas. */
export default async function PatientProgressPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/acompanhar');
  const c = await patientContextId((await searchParams).c);
  const [area, t] = await Promise.all([getPatientArea(), getMyTracking(c)]);
  if (area && !area.patient_account) redirect('/app');
  if (area && area.records.length === 0) redirect('/p');
  const record = area?.records.find((r) => r.patient_id === (t?.patient_id ?? c)) ?? area?.records[0] ?? null;
  const cid = t?.patient_id ?? null;
  const q = record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : '';

  if (!t) {
    return (
      <PatientShell practice={record?.practice ?? null} professional={record?.professional}>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Meu progresso</h1>
        <Alert variant="destructive"><AlertDescription>Não foi possível carregar agora. Atualize a página em instantes.</AlertDescription></Alert>
      </PatientShell>
    );
  }

  const series = weightSeries(t);
  const change = weightChange(series);
  const current = t.body.weight?.weight_kg ?? null;
  const left = toTarget(current, t.weight.target_kg);
  const adherence = t.meals ? mealAdherence(t.meals.last14) : null;
  const habitGoals = t.goals.filter((g) => g.kind === 'habit');
  const a = t.body.last_assessment;

  return (
    <PatientShell practice={record?.practice ?? null} professional={record?.professional} canSwitch={(area?.records.length ?? 0) > 1}>
      <div>
        <p className="text-sm text-muted-foreground">{new Date(`${t.today}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Meu progresso</h1>
      </div>

      {/* Perfil */}
      <section className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
            {t.profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{t.profile.name}</p>
            <p className="text-sm text-muted-foreground">
              {[t.profile.age !== null ? `${t.profile.age} anos` : null, t.profile.sex ? SEX[t.profile.sex] : null, t.body.height_cm ? `${num(t.body.height_cm, 0)} cm` : null].filter(Boolean).join(' · ') || 'Dados do cadastro'}
            </p>
          </div>
        </div>
        {t.profile.objective && (
          <p className="mt-4 flex gap-2 rounded-2xl bg-background/70 p-3 text-sm"><Target className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span><span className="font-medium">Objetivo:</span> {t.profile.objective}</span></p>
        )}
        {t.share.show_body && (current || a) && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {current && <Stat label="Peso atual" value={kg(current)} hint={t.body.weight!.source === 'clinic' ? `consultório, ${dayShort(String(t.body.weight!.at))}` : `em casa, ${dayShort(String(t.body.weight!.at).slice(0, 10))}`} />}
            {t.body.bmi && <Stat label="IMC" value={num(t.body.bmi.bmi)} hint={t.body.bmi.class ? t.body.bmi.label : 'veja com seu nutricionista'} />}
            {a?.waist_cm && <Stat label="Cintura" value={`${num(a.waist_cm)} cm`} hint={`avaliação de ${dayShort(a.date)}`} />}
            {a?.body_fat_pct && <Stat label="Gordura corporal" value={`${num(a.body_fat_pct)}%`} hint={`avaliação de ${dayShort(a.date)}`} />}
            {a?.hip_cm && !a.body_fat_pct && <Stat label="Quadril" value={`${num(a.hip_cm)} cm`} hint={`avaliação de ${dayShort(a.date)}`} />}
            {t.weight.target_kg && <Stat label="Peso-meta" value={kg(t.weight.target_kg)} hint={left === null ? undefined : left === 0 ? 'alcançado!' : `faltam ${kg(Math.abs(left))}`} />}
          </div>
        )}
        {t.share.show_body && t.body.bmi?.class && <BmiGauge bmi={t.body.bmi.bmi} label={t.body.bmi.label} />}
        {t.share.weight_neutral && (
          <p className="mt-4 flex gap-2 rounded-2xl bg-background/70 p-3 text-sm text-muted-foreground"><HeartHandshake className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />Seu acompanhamento aqui foca nos hábitos do dia a dia. As medidas ficam com o seu nutricionista nas consultas.</p>
        )}
      </section>

      {/* Peso */}
      {(t.share.self_weight || series.length > 0) && !t.share.weight_neutral && (
        <Card title="Meu peso" icon={<Ruler className="size-5 text-primary" aria-hidden="true" />}>
          {change && (
            <p className="mb-2 flex items-center gap-1.5 text-sm">
              {change.kg < 0 ? <TrendingDown className="size-4 text-primary" aria-hidden="true" /> : <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />}
              <span className="font-semibold">{change.kg === 0 ? 'Estável' : `${change.kg > 0 ? '+' : '−'}${kg(Math.abs(change.kg))}`}</span>
              <span className="text-muted-foreground">desde {dayShort(change.since)}</span>
            </p>
          )}
          {series.length > 0 ? <WeightTrend series={series} target={t.weight.target_kg} /> : <p className="text-sm text-muted-foreground">Registre sua primeira pesagem para ver o gráfico.</p>}
          {t.share.self_weight && (
            <div className="mt-3 space-y-3">
              <WeightLogger c={cid} lastKg={current} />
              <WeightLogList c={cid} logs={t.weight.logs} />
            </div>
          )}
        </Card>
      )}

      {/* Água */}
      {t.water && (
        <Card title="Água de hoje" icon={<span aria-hidden="true" className="text-lg">💧</span>}>
          <WaterTracker c={cid} water={t.water} />
          <div className="mt-5">
            <p className="mb-1 text-sm font-medium">Últimos 7 dias</p>
            <WaterBars days={t.water.days.slice(-7)} goal={t.water.goal_ml} />
          </div>
          <div className="mt-4"><WaterReminders c={cid} initial={t.water.reminders} telegramHref={`/p/avisos${q}`} /></div>
        </Card>
      )}

      {/* Metas */}
      {t.share.goals && (
        <Card title="Minhas metas" icon={<Target className="size-5 text-primary" aria-hidden="true" />}>
          {t.goals.length ? <GoalsChecklist c={cid} goals={t.goals} currentKg={current} /> : <p className="text-sm text-muted-foreground">Seu nutricionista ainda não definiu metas. Elas aparecem aqui para você marcar no dia a dia.</p>}
          {habitGoals.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Toque na meta quando fizer. Dá para desmarcar se tocar por engano.</p>}
        </Card>
      )}

      {/* Refeições */}
      {t.meals && t.meals.meals.length > 0 && (
        <Card title="Refeições do plano" icon={<UtensilsCrossed className="size-5 text-primary" aria-hidden="true" />}
          action={adherence !== null ? <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{adherence}% em 14 dias</span> : null}>
          <MealChecklist c={cid} meals={t.meals} />
          <Link href={`/p/plano${q}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">Ver o plano completo →</Link>
        </Card>
      )}

      {/* Consultas */}
      <Card title="Consultas" icon={<CalendarClock className="size-5 text-primary" aria-hidden="true" />}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Próxima" value={t.appointments.next ? new Date(t.appointments.next.starts_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '') : '—'}
            hint={t.appointments.next ? `${new Date(t.appointments.next.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })} · ${t.appointments.next.mode === 'online' ? 'on-line' : 'presencial'}` : 'nenhuma marcada'} />
          <Stat label="Última" value={t.appointments.last ? new Date(t.appointments.last).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '') : '—'} />
        </div>
        <Link href={`/p/mensagens${q}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">Falar com o nutricionista →</Link>
      </Card>
    </PatientShell>
  );
}
