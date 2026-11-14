'use client';

import { ChefHat, Loader2, Send } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { sendRecipe, unsendRecipe } from '@/lib/recipes/actions';
import type { PatientRecipeRow, RecipeSummary } from '@/lib/recipes/types';

/** RN-207 — Na ficha: receitas que o paciente vê (enviadas + do plano publicado) e envio de uma nova. */
export function PatientRecipes({ patientId, rows, library, hasAppAccess }: { patientId: string; rows: PatientRecipeRow[] | null; library: RecipeSummary[] | null; hasAppAccess: boolean }) {
  const [recipeId, setRecipeId] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const options = (library ?? []).filter((r) => !r.archived);

  function send(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const r = await sendRecipe(patientId, recipeId, note);
      if (r.ok) {
        setMessage({ ok: true, text: hasAppAccess ? 'Receita enviada. O paciente já vê na área do paciente.' : 'Receita enviada. O paciente verá quando tiver acesso à área do paciente.' });
        setRecipeId('');
        setNote('');
      } else setMessage({ ok: false, text: r.message });
    });
  }

  return (
    <section aria-labelledby="patient-recipes" className="rounded-2xl border border-border bg-card p-5">
      <h2 id="patient-recipes" className="flex items-center gap-2 font-display text-lg font-semibold"><ChefHat className="size-5" aria-hidden="true" /> Receitas do paciente</h2>
      <p className="mt-1 text-sm text-muted-foreground">As receitas do plano publicado aparecem sozinhas; as outras você envia aqui.</p>

      {rows === null ? (
        <p className="mt-3 text-sm text-destructive">Não foi possível carregar as receitas agora.</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma receita visível para o paciente.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border" aria-label="Receitas visíveis para o paciente">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{[r.in_plan && 'no plano', r.sent && 'enviada'].filter(Boolean).join(' · ')}</span>
                {r.note && <span className="block text-xs text-muted-foreground">“{r.note}”</span>}
              </span>
              {r.sent && (
                <Button type="button" variant="ghost" size="sm" disabled={pending}
                  onClick={() => start(async () => {
                    const x = await unsendRecipe(patientId, r.id);
                    setMessage(x.ok ? { ok: true, text: `${r.name} retirada.` } : { ok: false, text: x.message });
                  })}>
                  Retirar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {options.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Cadastre receitas em <Link href="/app/receitas" className="underline">Receitas</Link> para enviar.</p>
      ) : (
        <form onSubmit={send} aria-label="Enviar receita" className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="pr-recipe">Receita</Label>
            <select id="pr-recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Escolha…</option>
              {options.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-note">Observação (opcional)</Label>
            <input id="pr-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: boa opção para o lanche" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
          </div>
          <Button type="submit" disabled={pending || !recipeId}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar</Button>
        </form>
      )}
      {message && <p role="status" className={`mt-3 text-sm ${message.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{message.text}</p>}
    </section>
  );
}
