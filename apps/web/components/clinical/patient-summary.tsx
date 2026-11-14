import { bmi, bodyComposition, classifyBmi, computePlanTotals } from '@rafanutri/nutrition-core';
import { CalendarDays, ClipboardList, Ruler, Utensils, Video } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { DEMO_PLAN, foodById } from '@/lib/demo/foods';
import { demoHistory, demoPatient } from '@/lib/demo/patient';
import { dateBR as formatDateBR } from '@/lib/format/date';

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const dateBR = (iso: string) => formatDateBR(iso);

function Card({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="text-primary">{icon}</span> {title}
        </h2>
        {action}
      </header>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

const timeline = [
  { date: '2026-10-20', text: 'Retorno: avaliação antropométrica e ajuste do plano' },
  { date: '2026-10-20', text: 'Plano alimentar publicado (4 refeições)' },
  { date: '2026-09-15', text: 'Retorno: avaliação antropométrica' },
  { date: '2026-08-14', text: 'Anamnese respondida pelo link' },
  { date: '2026-08-12', text: 'Primeira consulta' },
];

export function PatientSummary({ basePath }: { basePath: string }) {
  const first = demoHistory[0]!;
  const last = demoHistory[demoHistory.length - 1]!;
  const fat = (a: typeof last) =>
    bodyComposition({ protocol: 'jp3', sex: demoPatient.sex, ageYears: demoPatient.ageYears, weightKg: a.weightKg, skinfolds: a.skinfolds }).bodyFatPct;
  const imc = bmi(last.weightKg, demoPatient.heightCm);
  const plan = computePlanTotals(
    DEMO_PLAN.map((m) => ({ id: m.id, items: m.items.map((i) => ({ quantityG: i.quantityG, per100g: foodById(i.foodId)!.per100g })) })),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card
        title="Última avaliação"
        icon={<Ruler className="size-5" />}
        action={<Link href={`${basePath}/avaliacao`} className="text-sm font-medium text-primary hover:underline">Nova avaliação</Link>}
      >
        <p className="text-xs text-muted-foreground">{dateBR(last.date)} · Jackson & Pollock 3 dobras</p>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">Peso</dt>
            <dd className="font-semibold tabular-nums">{fmt(last.weightKg)} kg</dd>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">IMC</dt>
            <dd className="font-semibold tabular-nums">{fmt(imc)}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">Gordura</dt>
            <dd className="font-semibold tabular-nums">{fmt(fat(last))}%</dd>
          </div>
        </dl>
        <p className="mt-3 text-sm">
          Desde a 1ª consulta: <span className="font-semibold text-primary">{fmt(last.weightKg - first.weightKg)} kg</span> e{' '}
          <span className="font-semibold text-primary">{fmt(fat(last) - fat(first))} p.p. de gordura</span>.{' '}
          <span className="text-muted-foreground">IMC: {classifyBmi(imc, demoPatient.ageYears) === 'overweight' ? 'sobrepeso' : 'eutrofia'}.</span>
        </p>
      </Card>

      <Card
        title="Plano vigente"
        icon={<Utensils className="size-5" />}
        action={<Link href={`${basePath}/plano`} className="text-sm font-medium text-primary hover:underline">Abrir editor</Link>}
      >
        <p className="text-xs text-muted-foreground">Publicado em 20 de out. · válido até 20 de nov.</p>
        <p className="mt-3 font-display text-3xl font-semibold tabular-nums">
          {fmt(plan.day.totals.energy_kcal ?? 0, 0)} <span className="text-base font-medium text-muted-foreground">kcal/dia</span>
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {DEMO_PLAN.map((m) => (
            <li key={m.id} className="flex justify-between">
              <span>
                <span className="tabular-nums text-muted-foreground">{m.time}</span> {m.name}
              </span>
              <span className="tabular-nums text-muted-foreground">{fmt(plan.meals[m.id]?.totals.energy_kcal ?? 0, 0)} kcal</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Próximas consultas" icon={<CalendarDays className="size-5" />}>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
            <div>
              <p className="font-medium">Retorno</p>
              <p className="text-muted-foreground">18 de nov. · 14:00</p>
            </div>
            <Badge variant="secondary" className="gap-1"><Video className="size-3" /> Online</Badge>
          </li>
          <li className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
            <div>
              <p className="font-medium">Reavaliação</p>
              <p className="text-muted-foreground">16 de dez. · 09:30</p>
            </div>
            <Badge variant="outline">Presencial</Badge>
          </li>
        </ul>
      </Card>

      <Card title="Anamnese" icon={<ClipboardList className="size-5" />}>
        <dl className="space-y-2 text-sm">
          <div><dt className="text-muted-foreground">Objetivo</dt><dd className="font-medium">{demoPatient.objective}</dd></div>
          <div><dt className="text-muted-foreground">Restrições</dt><dd className="font-medium">{demoPatient.restrictions.join(', ')}</dd></div>
          <div><dt className="text-muted-foreground">Rotina</dt><dd>Trabalho em escritório, musculação 3x por semana</dd></div>
          <div><dt className="text-muted-foreground">Queixas</dt><dd>Fome no fim da tarde, intestino preso</dd></div>
        </dl>
      </Card>

      <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
        <h2 className="font-semibold">Linha do tempo</h2>
        <ol className="mt-4 space-y-4 border-l border-border pl-5">
          {timeline.map((t) => (
            <li key={`${t.date}-${t.text}`} className="relative">
              <span className="absolute -left-[1.62rem] top-1 size-2.5 rounded-full bg-primary" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">{dateBR(t.date)}</p>
              <p className="text-sm">{t.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
