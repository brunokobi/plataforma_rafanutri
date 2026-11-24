'use client';

import { Loader2, Plus, Printer, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { applyTemplate } from '@/lib/meal-plans/template-actions';
import type { EnergyTarget, Suggestion } from '@/lib/meal-plans/suggest';

const kcal = (n: number) => `${Math.round(n).toLocaleString('pt-BR')} kcal`;

/**
 * Cartão "Planos sugeridos" da ficha: os modelos que mais combinam com o paciente, com o motivo,
 * para criar o rascunho já ajustado à meta ou imprimir na hora.
 */
export function PlanSuggestions({ patientId, suggestions, target }: { patientId: string; suggestions: Suggestion[]; target: EnergyTarget | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function create(s: Suggestion) {
    setError(null);
    setBusy(s.template.id);
    start(async () => {
      const r = await applyTemplate(patientId, s.template.id, s.targetKcal);
      setBusy(null);
      if (r.ok && r.id) router.push(`/app/pacientes/${patientId}/planos/${r.id}`);
      else if (!r.ok) setError(r.message);
    });
  }

  return (
    <section aria-labelledby="sugestoes" className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sugestoes" className="flex items-center gap-2 font-display text-xl font-semibold"><Sparkles className="size-5 text-primary" aria-hidden="true" /> Planos sugeridos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pelo perfil, pela anamnese e pelo acompanhamento do paciente.
            {target ? <> Meta usada: <strong className="font-medium text-foreground">{kcal(target.kcal)}</strong> ({target.detail}).</> : ' Sem meta calculada: os modelos vêm como estão (cadastre peso, altura, sexo e idade para ajustar).'}
          </p>
        </div>
        <Link href={`/app/pacientes/${patientId}/planos`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">Todos os modelos</Link>
      </div>
      {suggestions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma sugestão para este perfil ainda. Use os modelos na aba Planos.</p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {suggestions.map((s) => {
            const qualitative = s.template.mode === 'qualitative';
            const q = s.targetKcal ? `?kcal=${s.targetKcal}` : '';
            return (
              <li key={s.template.id} className="flex flex-col gap-3 rounded-xl border border-border p-4">
                <div>
                  <p className="font-medium leading-snug">{s.template.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.reasons.map((r) => <Badge key={r} variant="secondary" className="font-normal">{r}</Badge>)}
                    {qualitative && <Badge variant="outline" className="font-normal">qualitativo: sem números para o paciente</Badge>}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {qualitative ? 'Refeições estruturadas, sem calorias nem gramas no material do paciente.'
                      : s.targetKcal && s.template.energy_kcal ? `Modelo de ${kcal(s.template.energy_kcal)}, ajustado a ${kcal(s.targetKcal)}.`
                        : s.template.energy_kcal ? `Modelo de ${kcal(s.template.energy_kcal)}.` : ''}
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={busy !== null} onClick={() => create(s)}>
                    {busy === s.template.id ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Criar plano
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/app/pacientes/${patientId}/modelos/${s.template.id}/imprimir${q}`}><Printer className="size-4" /> Ver e imprimir</Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <p className="mt-4 text-xs text-muted-foreground">Modelos base da biblioteca: o plano é criado como rascunho para você revisar antes de publicar.</p>
    </section>
  );
}
