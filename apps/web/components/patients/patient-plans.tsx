'use client';

import { AlertCircle, CopyPlus, FileText, Info, Loader2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createMealPlan, deleteMealPlanDraft } from '@/lib/meal-plans/actions';
import { STATUS_LABEL, type MealPlanSummary } from '@/lib/meal-plans/schema';
import { cn } from '@/lib/utils';

const dateBR = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export function PatientPlans({ patientId, plans }: { patientId: string; plans: MealPlanSummary[] | null | 'unavailable' }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const list = Array.isArray(plans) ? plans : [];

  function create(fromPlanId?: string) {
    setError(null);
    setBusy(fromPlanId ?? 'new');
    startTransition(async () => {
      const r = await createMealPlan(patientId, fromPlanId);
      setBusy(null);
      if (r.ok && r.id) router.push(`/app/pacientes/${patientId}/planos/${r.id}`);
      else if (!r.ok) setError(r.message);
    });
  }

  function remove(planId: string) {
    if (!window.confirm('Apagar este rascunho? Esta ação não pode ser desfeita.')) return;
    setError(null);
    setBusy(planId);
    startTransition(async () => {
      const r = await deleteMealPlanDraft(patientId, planId);
      setBusy(null);
      if (r.ok) router.refresh();
      else setError(r.message);
    });
  }

  if (plans === 'unavailable') {
    return (
      <Alert>
        <Info />
        <AlertTitle>Planos por paciente em ativação</AlertTitle>
        <AlertDescription>
          <p>O servidor ainda não está liberado para salvar planos alimentares. Enquanto isso, use o editor de demonstração com a TACO.</p>
          <Link href="/app/pacientes/exemplo/plano" className="mt-2 inline-block font-medium text-primary hover:underline">Abrir o editor de demonstração</Link>
        </AlertDescription>
      </Alert>
    );
  }
  if (plans === null) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertDescription>Não foi possível carregar os planos agora. Atualize a página em instantes.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Só um plano fica publicado por vez. Publicar um novo arquiva o anterior; publicados não são editados, crie uma nova versão.
        </p>
        <Button type="button" onClick={() => create()} disabled={busy !== null}>
          {busy === 'new' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Novo plano
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum plano criado ainda.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" aria-label="Planos alimentares">
          {list.map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <FileText className={cn('size-5 shrink-0', plan.status === 'published' ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <Link href={`/app/pacientes/${patientId}/planos/${plan.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                  {plan.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {plan.status === 'published' && plan.published_at
                    ? `Publicado em ${dateBR(plan.published_at)}${plan.valid_until ? ` · válido até ${dateBR(plan.valid_until)}` : ''}`
                    : `Criado em ${dateBR(plan.date_created)}`}
                  {plan.totals?.energy_kcal ? ` · ${Math.round(plan.totals.energy_kcal).toLocaleString('pt-BR')} kcal/dia` : ''}
                </p>
              </div>
              <Badge variant={plan.status === 'published' ? 'default' : plan.status === 'draft' ? 'secondary' : 'outline'}>{STATUS_LABEL[plan.status]}</Badge>
              {plan.status === 'draft' ? (
                <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => remove(plan.id)} aria-label={`Apagar rascunho ${plan.title}`}>
                  {busy === plan.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Apagar
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => create(plan.id)}>
                  {busy === plan.id ? <Loader2 className="size-4 animate-spin" /> : <CopyPlus className="size-4" />} Nova versão
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
