'use client';

import { ChevronDown, Loader2, Pencil, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deletePlanTemplate, updateTemplateInfo } from '@/lib/meal-plans/template-actions';
import type { MealPlanTemplate } from '@/lib/meal-plans/templates';
import { cn } from '@/lib/utils';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const fmtKcal = (n: number) => Math.round(n).toLocaleString('pt-BR');

/** Busca por nome, descrição ou etiqueta (sem acento) e filtro por etiqueta. */
export function filterTemplates(templates: MealPlanTemplate[], query: string, tag: string | null): MealPlanTemplate[] {
  const q = norm(query.trim());
  return templates.filter(
    (t) => (!tag || t.tags.includes(tag)) && (!q || norm(t.name).includes(q) || norm(t.description ?? '').includes(q) || t.tags.some((x) => norm(x).includes(q))),
  );
}

function TemplateCard({ t, foodNames }: { t: MealPlanTemplate; foodNames: Record<string, string> }) {
  const router = useRouter();
  const own = Boolean(t.organization_id);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description ?? '');
  const [tags, setTags] = useState(t.tags.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const items = t.meals.reduce((n, m) => n + m.items.length, 0);

  return (
    <li className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">{t.name}</h2>
          <p className="text-sm text-muted-foreground">
            {t.energy_kcal ? `${fmtKcal(t.energy_kcal)} kcal/dia · ` : ''}
            {t.meals.length} refeições · {items} alimentos{t.mode === 'qualitative' ? ' · qualitativo' : ''}
          </p>
        </div>
        <Badge variant={own ? 'default' : 'secondary'}>{own ? 'Do consultório' : 'Biblioteca'}</Badge>
      </div>
      {t.description && <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>}
      {t.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {t.tags.map((x) => (
            <Badge key={x} variant="outline">{x}</Badge>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown className={cn('size-4 transition', open && 'rotate-180')} /> {open ? 'Ocultar refeições' : 'Ver refeições'}
        </Button>
        {own && !editing && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Editar nome e etiquetas
          </Button>
        )}
        {own && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Apagar o modelo "${t.name}"? Planos já criados com ele não mudam.`)) return;
              startTransition(async () => {
                const r = await deletePlanTemplate(t.id);
                if (r.ok) router.refresh();
                else setError(r.message);
              });
            }}
          >
            <Trash2 className="size-4" /> Apagar
          </Button>
        )}
      </div>

      {editing && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          aria-label={`Editar ${t.name}`}
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const r = await updateTemplateInfo(t.id, { name, description, tags });
              if (r.ok) {
                setEditing(false);
                router.refresh();
              } else setError(r.message);
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`en-${t.id}`} className="text-xs">Nome</Label>
            <Input id={`en-${t.id}`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`et-${t.id}`} className="text-xs">Etiquetas (separe por vírgula)</Label>
            <Input id={`et-${t.id}`} value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`ed-${t.id}`} className="text-xs">Descrição</Label>
            <Input id={`ed-${t.id}`} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>Cancelar</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {t.meals.map((m) => (
            <div key={m.id}>
              <p className="text-sm font-medium">{m.time} · {m.name}</p>
              {m.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem alimentos.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {m.items.map((i) => (
                    <li key={i.key}>
                      {foodNames[i.foodId] ?? `Alimento ${i.foodId}`}
                      {t.mode === 'quantitative' ? ` — ${Math.round(i.quantityG)} g` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export function PlanTemplatesList({ templates, foodNames }: { templates: MealPlanTemplate[]; foodNames: Record<string, string> }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const allTags = useMemo(() => [...new Set(templates.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [templates]);
  const shown = filterTemplates(templates, query, tag);

  if (templates.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Nenhum modelo ainda. Na ficha de um paciente, aba Plano alimentar, use “Salvar como modelo” em um plano pronto.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou etiqueta" aria-label="Buscar modelo" className="h-10 pl-9" />
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por etiqueta">
          {[null, ...allTags].map((x) => (
            <button
              key={x ?? 'todas'}
              type="button"
              aria-pressed={tag === x}
              onClick={() => setTag(x)}
              className={cn('rounded-full border px-3 py-1 text-xs', tag === x ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
            >
              {x ?? 'Todas'}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum modelo encontrado.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((t) => (
            <TemplateCard key={t.id} t={t} foodNames={foodNames} />
          ))}
        </ul>
      )}
    </div>
  );
}
