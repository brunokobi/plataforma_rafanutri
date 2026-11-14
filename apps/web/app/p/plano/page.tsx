import { ArrowLeft, ChefHat, Repeat, Utensils } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { dateBR } from '@/lib/format/date';
import { getPatientArea, getPatientPlan } from '@/lib/patient-area/actions';
import { buildPatientPlanView } from '@/lib/patient-area/plan-view';

export const metadata: Metadata = { title: 'Meu plano alimentar', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** RN-205 — Plano publicado completo: refeições, alimentos com medidas caseiras, substituições, orientações e preparações. */
export default async function PatientPlanPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/plano');
  const { c } = await searchParams;
  const [area, payload] = await Promise.all([getPatientArea(), getPatientPlan(c)]);
  if (area && !area.patient_account) redirect('/app');
  const record = area?.records.find((r) => r.patient_id === (payload?.patient_id ?? c)) ?? area?.records[0] ?? null;
  const back = `/p${record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : ''}`;

  if (!payload) {
    return (
      <PatientShell practice={record?.practice ?? null} professional={record?.professional}>
        <BackLink href={back} />
        <section className="rounded-2xl border border-dashed border-border p-6 text-center">
          <Utensils className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-3 font-semibold">Seu plano ainda não foi publicado</h1>
          <p className="mt-1 text-sm text-muted-foreground">Assim que o plano alimentar for publicado, ele aparece aqui.</p>
        </section>
      </PatientShell>
    );
  }

  const plan = buildPatientPlanView(payload);
  return (
    <PatientShell practice={record?.practice ?? null} professional={record?.professional}>
      <BackLink href={back} />
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{plan.title}</h1>
        <p className="text-sm text-muted-foreground">
          {plan.publishedAt ? `Publicado em ${dateBR(plan.publishedAt)}` : ''}
          {plan.validUntil ? ` · válido até ${dateBR(plan.validUntil)}` : ''}
        </p>
      </div>

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
            {m.time && <span className="shrink-0 text-sm font-normal text-muted-foreground">{m.time}</span>}
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
    </PatientShell>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" /> Início
    </Link>
  );
}
