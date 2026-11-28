import { Activity, Droplets, HeartHandshake, Scale, Target, UtensilsCrossed } from 'lucide-react';
import { WaterBars, WeightTrend } from '@/components/tracking/charts';
import { GoalManager, WaterGoalForm } from '@/components/tracking/pro-forms';
import { dateTimeBR, daysSince, kg, liters, mealAdherence, weightSeries, type Tracking } from '@/lib/tracking/types';

function Block({ title, icon, children, aside }: { title: string; icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="mb-3 flex items-center gap-2">{icon}<h3 className="flex-1 text-sm font-semibold">{title}</h3>{aside}</div>
      {children}
    </div>
  );
}

/** Ficha do nutricionista: o que o paciente registra em casa (peso, água, metas e refeições). */
export function PatientTrackingPanel({ t, linked }: { t: Tracking; linked: boolean }) {
  const series = weightSeries(t);
  const idle = daysSince(t.last_activity_at);
  const adherence = t.meals ? mealAdherence(t.meals.last14) : null;
  const water = t.water!;
  return (
    <section aria-labelledby="em-casa" className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="size-5 text-primary" aria-hidden="true" />
        <h2 id="em-casa" className="font-display text-lg font-semibold">Acompanhamento em casa</h2>
        <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${idle === null ? 'bg-muted text-muted-foreground' : idle >= 7 ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-primary/10 text-primary'}`}>
          {!linked ? 'Paciente ainda sem o app' : idle === null ? 'Nenhum registro ainda' : idle === 0 ? 'Registrou hoje' : `Último registro há ${idle} ${idle === 1 ? 'dia' : 'dias'}`}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">O que o paciente registra no app: pesagens com dia e horário, água, metas e refeições do plano.</p>
      {t.share.weight_neutral && (
        <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <HeartHandshake className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Modo sem números de peso ligado{t.share.ed_detected ? ' (sinal de transtorno alimentar na anamnese ou no objetivo)' : ''}: o paciente não vê peso nem IMC e não registra peso. Mude em &quot;O que o paciente vê&quot;.
        </p>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Block title="Peso" icon={<Scale className="size-4 text-primary" aria-hidden="true" />}
          aside={t.weight.logs.length ? <span className="text-xs text-muted-foreground">{t.weight.logs.length} em casa</span> : null}>
          {series.length ? <WeightTrend series={series} target={t.weight.target_kg} /> : <p className="text-sm text-muted-foreground">Sem pesagens ainda.</p>}
          {t.weight.logs.length > 0 && (
            <ul className="mt-2 divide-y divide-border text-sm">
              {[...t.weight.logs].reverse().slice(0, 4).map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-1.5">
                  <span className="font-semibold tabular-nums">{kg(l.weight_kg)}</span>
                  <span className="text-muted-foreground">{dateTimeBR(l.measured_at)}{l.note ? ` · ${l.note}` : ''}</span>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">registrado pelo paciente</span>
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block title="Água" icon={<Droplets className="size-4 text-sky-500" aria-hidden="true" />}
          aside={<span className="text-xs text-muted-foreground">hoje {liters(water.today_ml)} de {liters(water.goal_ml)}{water.streak ? ` · ${water.streak} dias seguidos` : ''}</span>}>
          <WaterBars days={water.days.slice(-14)} goal={water.goal_ml} />
          <div className="mt-3"><WaterGoalForm patientId={t.patient_id} value={water.professional_goal_ml} suggested={water.goal_source === 'professional' ? 2000 : water.goal_ml} /></div>
          <p className="mt-2 text-xs text-muted-foreground">Lembretes de água: {water.reminders.on ? `ligados, a cada ${(water.reminders.every_min / 60).toLocaleString('pt-BR')} h, das ${water.reminders.start} às ${water.reminders.end}` : 'desligados pelo paciente'}.</p>
        </Block>
        <Block title="Metas" icon={<Target className="size-4 text-primary" aria-hidden="true" />}>
          <GoalManager patientId={t.patient_id} goals={t.goals} weightNeutral={t.share.weight_neutral} />
        </Block>
        <Block title="Refeições do plano" icon={<UtensilsCrossed className="size-4 text-primary" aria-hidden="true" />}
          aside={adherence !== null ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{adherence}% em 14 dias</span> : null}>
          {t.meals ? (
            <div className="flex h-24 items-end gap-1" role="img" aria-label={`Refeições marcadas nos últimos 14 dias: adesão de ${adherence ?? 0}%.`}>
              {t.meals.last14.map((d) => (
                <span key={d.day} title={`${d.day.slice(8, 10)}/${d.day.slice(5, 7)}: ${d.done} de ${d.total}`} className="flex-1 rounded-t bg-primary/80" style={{ height: `${d.total ? Math.max(4, (Math.min(d.done, d.total) / d.total) * 100) : 4}%`, opacity: d.done ? 1 : 0.2 }} />
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">Sem plano publicado. Depois de publicar, o paciente marca as refeições feitas.</p>}
        </Block>
      </div>
    </section>
  );
}
