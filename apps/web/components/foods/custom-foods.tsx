'use client';

import { Archive, Loader2, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { CustomFoodForm } from '@/components/foods/custom-food-form';
import { RecipeForm } from '@/components/foods/recipe-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setFoodArchived } from '@/lib/foods/custom-actions';
import type { CustomFood } from '@/lib/foods/custom';
import { normalizeSearch } from '@/lib/foods/food';
import { cn } from '@/lib/utils';

type Tab = 'food' | 'recipe';
const fmt = (n: number | null | undefined, d = 1) => (n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: d }));

/** Filtra por aba, arquivados e busca sem acento. */
export function filterCustomFoods(foods: CustomFood[], tab: Tab, query: string, showArchived: boolean): CustomFood[] {
  const q = normalizeSearch(query);
  return foods.filter((f) => (f.kind ?? 'food') === tab && (showArchived || !f.archived) && (!q || normalizeSearch(f.name).includes(q)));
}

export function CustomFoods({ foods }: { foods: CustomFood[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('food');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<'new-food' | 'new-recipe' | { edit: CustomFood } | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const shown = useMemo(() => filterCustomFoods(foods, tab, query, showArchived), [foods, tab, query, showArchived]);
  const count = (t: Tab) => foods.filter((f) => (f.kind ?? 'food') === t && !f.archived).length;

  const done = (text: string) => {
    setForm(null);
    setMessage({ kind: 'ok', text });
    router.refresh();
  };

  function toggleArchive(f: CustomFood) {
    setBusy(f.id);
    setMessage(null);
    startTransition(async () => {
      const r = await setFoodArchived(f.id, !f.archived);
      setBusy(null);
      if (r.ok) done(f.archived ? `${f.name} voltou para a busca.` : `${f.name} foi arquivado: some da busca, mas continua nos planos em que já está.`);
      else setMessage({ kind: 'error', text: r.message });
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Tipo" className="inline-flex rounded-lg border border-border p-1">
          {([['food', 'Alimentos'], ['recipe', 'Preparações']] as const).map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', tab === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {l} ({count(v)})
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => { setForm('new-food'); setMessage(null); }} disabled={form !== null}><Plus className="size-4" /> Novo alimento</Button>
          <Button type="button" onClick={() => { setForm('new-recipe'); setMessage(null); }} disabled={form !== null}><Plus className="size-4" /> Nova preparação</Button>
        </div>
      </div>

      {form === 'new-food' && <CustomFoodForm onDone={done} onCancel={() => setForm(null)} />}
      {form === 'new-recipe' && <RecipeForm onDone={done} onCancel={() => setForm(null)} />}
      {form && typeof form === 'object' && <CustomFoodForm initial={form.edit} onDone={done} onCancel={() => setForm(null)} />}
      {message && <p role="status" className={cn('text-sm', message.kind === 'ok' ? 'text-primary' : 'text-destructive')}>{message.text}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" aria-label="Buscar alimento do consultório" className="h-10 pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivados
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {tab === 'food' ? 'Nenhum alimento próprio. Cadastre produtos pelo rótulo ou ajuste um alimento da TACO.' : 'Nenhuma preparação. Monte receitas da casa a partir de ingredientes da TACO e dos seus alimentos.'}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card" aria-label={tab === 'food' ? 'Alimentos do consultório' : 'Preparações do consultório'}>
          {shown.map((f) => (
            <li key={f.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3', f.archived && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.name}</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {fmt(f.per100g.energy_kcal, 0)} kcal · P {fmt(f.per100g.protein_g)} g · C {fmt(f.per100g.carbohydrate_g)} g · G {fmt(f.per100g.lipid_g)} g (em 100 g)
                  {f.group ? ` · ${f.group}` : ''}
                </p>
              </div>
              {f.archived && <Badge variant="outline">Arquivado</Badge>}
              {f.kind === 'recipe' ? (
                <Button asChild variant="ghost" size="sm"><Link href={`/app/alimentos/preparacoes/${f.id}`}><Pencil className="size-4" /> Editar</Link></Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" disabled={form !== null} onClick={() => { setForm({ edit: f }); setMessage(null); }}><Pencil className="size-4" /> Editar</Button>
              )}
              <Button type="button" variant="ghost" size="sm" disabled={busy === f.id} onClick={() => toggleArchive(f)} aria-label={`${f.archived ? 'Reativar' : 'Arquivar'} ${f.name}`}>
                {busy === f.id ? <Loader2 className="size-4 animate-spin" /> : f.archived ? <RotateCcw className="size-4" /> : <Archive className="size-4" />} {f.archived ? 'Reativar' : 'Arquivar'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
