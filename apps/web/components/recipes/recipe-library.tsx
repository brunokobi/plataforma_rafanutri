'use client';

import { ChefHat, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { RecipeForm } from '@/components/foods/recipe-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { allTags, filterRecipes, recipeMeta } from '@/lib/recipes/filter';
import { DIFFICULTY_LABEL, type RecipeSummary } from '@/lib/recipes/types';

/** RN-206 — Biblioteca de receitas do consultório: busca, filtro por tag e cartões com foto. */
export function RecipeLibrary({ recipes }: { recipes: RecipeSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pool = useMemo(() => recipes.filter((r) => showArchived || !r.archived), [recipes, showArchived]);
  const tags = useMemo(() => allTags(pool), [pool]);
  const shown = filterRecipes(pool, query, tag);

  return (
    <div className="space-y-5">
      {message && <p role="status" className="rounded-lg bg-primary/10 px-4 py-2 text-sm">{message}</p>}
      {creating ? (
        <RecipeForm
          onCancel={() => setCreating(false)}
          onDone={(m) => {
            setCreating(false);
            setMessage(m);
            router.refresh();
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar receita" aria-label="Buscar receita" className="pl-9" />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivadas
          </label>
          <Button type="button" className="ml-auto" onClick={() => { setCreating(true); setMessage(null); }}><Plus className="size-4" /> Nova receita</Button>
        </div>
      )}

      {tags.length > 0 && (
        <div role="group" aria-label="Filtrar por tag" className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}
              className="min-h-9 rounded-full border border-border px-3 text-sm aria-pressed:border-primary aria-pressed:bg-primary/10">
              {t}
            </button>
          ))}
        </div>
      )}

      {pool.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <ChefHat className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">Nenhuma receita ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre suas receitas com ingredientes, porções e foto. Elas entram no plano alimentar e você pode enviá-las aos pacientes.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma receita encontrada.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Receitas">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/app/alimentos/preparacoes/${r.id}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card hover:border-primary/60">
                {r.has_image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- rota privada com o token do usuário
                  <img src={`/api/receitas/${r.id}/foto`} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/60"><ChefHat className="size-10 text-muted-foreground" aria-hidden="true" /></div>
                )}
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <p className="font-semibold">{r.name}{r.archived && <span className="ml-2 text-xs font-normal text-muted-foreground">(arquivada)</span>}</p>
                  {recipeMeta(r, DIFFICULTY_LABEL) && <p className="text-sm text-muted-foreground">{recipeMeta(r, DIFFICULTY_LABEL)}</p>}
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {r.kcal_per_serving != null ? `${r.kcal_per_serving} kcal por porção` : r.kcal_per_100g != null ? `${r.kcal_per_100g} kcal em 100 g` : ''}
                  </p>
                  {r.tags.length > 0 && (
                    <p className="mt-auto flex flex-wrap gap-1 pt-2">{r.tags.map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t}</span>)}</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
