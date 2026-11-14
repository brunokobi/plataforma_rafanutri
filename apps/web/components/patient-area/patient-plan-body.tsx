import { ChefHat, Repeat } from 'lucide-react';
import type { PatientPlanView } from '@/lib/patient-area/plan-view';

const n = (v: number) => v.toLocaleString('pt-BR');

/** Miolo do plano como o paciente vê (RN-205, com totais liberados pelo RN-210). Usado em /p/plano e em "ver como paciente". */
export function PatientPlanBody({ plan }: { plan: PatientPlanView }) {
  return (
    <>
      {plan.totals && (
        <section aria-label="Totais do dia" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['Energia', plan.totals.energy, 'kcal'],
            ['Proteínas', plan.totals.protein, 'g'],
            ['Carboidratos', plan.totals.carbohydrate, 'g'],
            ['Gorduras', plan.totals.lipid, 'g'],
          ] as const).filter(([, v]) => v !== null).map(([k, v, u]) => (
            <div key={k} className="rounded-xl border border-border bg-card px-3 py-2">
              <p className="text-xs text-muted-foreground">{k} no dia</p>
              <p className="font-semibold tabular-nums">{n(v!)} {u}</p>
            </div>
          ))}
        </section>
      )}
      <nav aria-label="Refeições" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {plan.meals.map((m) => (
          <a key={m.id} href={`#refeicao-${m.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border px-4 text-sm">
            {m.name}
          </a>
        ))}
      </nav>

      {plan.meals.map((m) => (
        <section key={m.id} id={`refeicao-${m.id}`} aria-labelledby={`h-${m.id}`} className="scroll-mt-4 rounded-2xl border border-border bg-card p-5">
          <h2 id={`h-${m.id}`} className="flex items-baseline justify-between gap-3 font-display text-lg font-semibold">
            <span className="min-w-0 break-words">{m.name}</span>
            <span className="shrink-0 text-sm font-normal text-muted-foreground">{[m.time, m.kcal !== null ? `${n(m.kcal)} kcal` : null].filter(Boolean).join(' · ')}</span>
          </h2>
          {m.items.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Sem itens nesta refeição.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {m.items.map((it, idx) => (
                <li key={idx} className="py-3">
                  <p className="break-words font-medium">{it.name}</p>
                  {it.amount && <p className="text-sm text-muted-foreground">{it.amount}</p>}
                  {it.substitutions.length > 0 && (
                    <details className="mt-2 rounded-lg bg-muted/50 px-3 text-sm">
                      <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 font-medium">
                        <Repeat className="size-4" aria-hidden="true" /> Pode trocar por ({it.substitutions.length})
                      </summary>
                      <ul className="space-y-1 pb-3">
                        {it.substitutions.map((s, k) => <li key={k} className="break-words">{s}</li>)}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {plan.guidelines.length > 0 && (
        <section aria-labelledby="orientacoes" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="orientacoes" className="font-display text-lg font-semibold">Orientações</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {plan.guidelines.map((g, k) => <li key={k} className="break-words">{g}</li>)}
          </ul>
        </section>
      )}

      {plan.recipes.length > 0 && (
        <section aria-labelledby="preparacoes" className="space-y-3">
          <h2 id="preparacoes" className="flex items-center gap-2 font-display text-lg font-semibold"><ChefHat className="size-5" aria-hidden="true" /> Preparações</h2>
          {plan.recipes.map((r, k) => (
            <article key={k} className="rounded-2xl border border-border bg-card p-5 text-sm">
              <h3 className="break-words font-semibold">{r.name}</h3>
              {r.yieldText && <p className="text-muted-foreground">{r.yieldText}</p>}
              <ul className="mt-2 list-disc space-y-1 pl-5">{r.ingredients.map((i, j) => <li key={j}>{i}</li>)}</ul>
              {r.instructions && <p className="mt-3 whitespace-pre-line break-words">{r.instructions}</p>}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
