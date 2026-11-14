'use client';

import { ChefHat } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { allTags, filterRecipes, recipeMeta } from '@/lib/recipes/filter';
import { DIFFICULTY_LABEL, type VisibleRecipe } from '@/lib/recipes/types';

/** Lista de receitas do paciente com filtro por tag. Mobile-first. */
export function PatientRecipeList({ recipes, query }: { recipes: VisibleRecipe[]; query: string }) {
  const [tag, setTag] = useState<string | null>(null);
  const tags = allTags(recipes);
  const shown = filterRecipes(recipes, '', tag);
  return (
    <div className="space-y-4">
      {tags.length > 0 && (
        <div role="group" aria-label="Filtrar por tag" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {tags.map((t) => (
            <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}
              className="min-h-11 shrink-0 rounded-full border border-border px-4 text-sm aria-pressed:border-primary aria-pressed:bg-primary/10">
              {t}
            </button>
          ))}
        </div>
      )}
      <ul className="grid gap-4 sm:grid-cols-2" aria-label="Suas receitas">
        {shown.map((r) => (
          <li key={r.id}>
            <Link href={`/p/receitas/${r.id}${query}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
              {r.has_image ? (
                // eslint-disable-next-line @next/next/no-img-element -- rota privada com o token do paciente
                <img src={`/api/receitas/${r.id}/foto`} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/60"><ChefHat className="size-10 text-muted-foreground" aria-hidden="true" /></div>
              )}
              <div className="flex flex-1 flex-col gap-1 p-4">
                <p className="break-words font-semibold">{r.name}</p>
                {recipeMeta(r, DIFFICULTY_LABEL) && <p className="text-sm text-muted-foreground">{recipeMeta(r, DIFFICULTY_LABEL)}</p>}
                <p className="text-xs text-muted-foreground">{r.in_plan ? 'No seu plano' : 'Enviada pelo seu nutricionista'}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
