'use client';

import { Check, Target, UtensilsCrossed } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { checkMyGoal, checkMyMeal } from '@/lib/tracking/actions';
import { goalProgress, kg, type Goal, type Tracking } from '@/lib/tracking/types';
import { cn } from '@/lib/utils';

function CheckCircle({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={cn('grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
      {on && <Check className="size-4" strokeWidth={3} />}
    </span>
  );
}

/** Metas do nutricionista: o paciente marca "fiz hoje" e vê o progresso da semana. */
export function GoalsChecklist({ c, goals, currentKg }: { c: string | null; goals: Goal[]; currentKg: number | null }) {
  const [state, setState] = useState(() => Object.fromEntries(goals.map((g) => [g.id, { today: g.done_today, week: g.done_week }])));
  const router = useRouter();
  const toggle = async (g: Goal) => {
    const cur = state[g.id]!;
    const next = !cur.today;
    setState((s) => ({ ...s, [g.id]: { today: next, week: Math.max(0, cur.week + (next ? 1 : -1)) } }));
    const r = await checkMyGoal(c, g.id, next);
    if (!r.ok) { setState((s) => ({ ...s, [g.id]: cur })); toast.error(r.message); return; }
    router.refresh();
  };
  return (
    <ul className="space-y-2">
      {goals.map((g) => {
        if (g.kind === 'weight') {
          const left = currentKg && g.target_weight_kg ? Math.round((currentKg - g.target_weight_kg) * 10) / 10 : null;
          return (
            <li key={g.id} className="flex items-center gap-3 rounded-2xl border border-border p-3.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Target className="size-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{g.title}</span>
                <span className="block text-sm text-muted-foreground">Meta: {kg(g.target_weight_kg!)}{left !== null ? (left === 0 ? ' · alcançada!' : ` · faltam ${kg(Math.abs(left))}`) : ''}</span>
              </span>
            </li>
          );
        }
        const s = state[g.id]!;
        const p = goalProgress({ frequency: g.frequency, times_per_week: g.times_per_week, done_week: s.week });
        return (
          <li key={g.id}>
            <button type="button" aria-pressed={s.today} onClick={() => void toggle(g)}
              className={cn('flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors', s.today ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/50')}>
              <CheckCircle on={s.today} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{g.title}</span>
                {g.details && <span className="block text-sm text-muted-foreground">{g.details}</span>}
                <span className="mt-2 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${p.pct}%` }} /></span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.done}/{p.of} {g.frequency === 'weekly' ? 'na semana' : 'dias'}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Refeições do plano de hoje: marcar como feita (adesão ao plano). */
export function MealChecklist({ c, meals }: { c: string | null; meals: NonNullable<Tracking['meals']> }) {
  const [done, setDone] = useState<Set<string>>(new Set(meals.today));
  const toggle = async (id: string) => {
    const on = !done.has(id);
    setDone((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
    const r = await checkMyMeal(c, meals.plan_id, id, on);
    if (!r.ok) { setDone((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; }); toast.error(r.message); }
  };
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground"><UtensilsCrossed className="mr-1 inline size-4" aria-hidden="true" />{done.size} de {meals.meals.length} refeições hoje</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {meals.meals.map((m) => {
          const on = done.has(m.id);
          return (
            <li key={m.id}>
              <button type="button" aria-pressed={on} onClick={() => void toggle(m.id)}
                className={cn('flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3.5 text-left transition-colors', on ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/50')}>
                <CheckCircle on={on} />
                <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                {m.time && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{m.time}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
