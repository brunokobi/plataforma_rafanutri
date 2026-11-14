'use client';

import { recipeNutrition } from '@rafanutri/nutrition-core';
import { AlertCircle, ImagePlus, Loader2, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveRecipe } from '@/lib/foods/custom-actions';
import { foodOriginLabel, type Food } from '@/lib/foods/food';
import { searchFoods } from '@/lib/foods/actions';
import { removeRecipeImage, uploadRecipeImage } from '@/lib/recipes/actions';
import { parseTags } from '@/lib/recipes/filter';
import { resizeImage } from '@/lib/recipes/resize-image';
import { DIFFICULTY_LABEL, type Difficulty } from '@/lib/recipes/types';

type Line = { food: Food; quantity: string };
const toNum = (v: string) => Number(v.replace(',', '.'));
const fmt = (n: number, d = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: d });

/** Prévia da composição por 100 g (o servidor recalcula com a composição do banco ao salvar). */
export function previewPer100g(lines: Array<{ food: Food; quantityG: number }>, yieldG: number) {
  if (!(yieldG > 0) || lines.length === 0) return null;
  try {
    return recipeNutrition(lines.map((l) => ({ quantityG: l.quantityG, per100g: l.food.per100g })), yieldG);
  } catch {
    return null;
  }
}

export interface RecipeInitial {
  id: string;
  name: string;
  group: string;
  yield_g: number | null;
  servings: number | null;
  instructions: string | null;
  lines: Array<{ food: Food; quantityG: number }>;
  description?: string | null;
  prep_minutes?: number | null;
  difficulty?: Difficulty | null;
  tags?: string[];
  has_image?: boolean;
}

export function RecipeForm({ initial, onDone, onCancel }: { initial?: RecipeInitial; onDone: (msg: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [group, setGroup] = useState(initial?.group ?? 'Preparações');
  const [lines, setLines] = useState<Line[]>(initial?.lines.map((l) => ({ food: l.food, quantity: String(l.quantityG) })) ?? []);
  const [yieldG, setYieldG] = useState(initial?.yield_g ? String(initial.yield_g) : '');
  const [servings, setServings] = useState(initial?.servings ? String(initial.servings) : '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [prep, setPrep] = useState(initial?.prep_minutes ? String(initial.prep_minutes) : '');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(initial?.difficulty ?? '');
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  // Foto: 'keep' (sem mudança), data URL nova ou 'remove'
  const [photo, setPhoto] = useState<string | 'keep' | 'remove'>('keep');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoVersion] = useState(() => Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState('');
  const [found, setFound] = useState<Food[]>([]);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await searchFoods(text);
      if (!cancelled) setFound(r.ok ? r.foods.filter((f) => f.id !== initial?.id).slice(0, 8) : []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, initial?.id]);

  const totalIngredients = lines.reduce((s, l) => s + (toNum(l.quantity) || 0), 0);
  const preview = useMemo(
    () => previewPer100g(lines.filter((l) => toNum(l.quantity) > 0).map((l) => ({ food: l.food, quantityG: toNum(l.quantity) })), toNum(yieldG)),
    [lines, yieldG],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage(null);
    startTransition(async () => {
      const r = await saveRecipe(
        {
          name, food_group: group, yield_g: yieldG, servings: servings || null, instructions, items: lines.map((l) => ({ foodId: l.food.id, quantityG: l.quantity })),
          description, prep_minutes: prep || null, difficulty: difficulty || null, tags: parseTags(tagsText),
        },
        initial?.id,
      );
      if (r.ok && photo !== 'keep') {
        const p = photo === 'remove' ? await removeRecipeImage(r.id) : await uploadRecipeImage(r.id, photo);
        if (!p.ok) {
          setMessage(`Receita salva, mas a foto não: ${p.message}`);
          return;
        }
      }
      if (r.ok) onDone(initial ? 'Preparação atualizada.' : `Preparação cadastrada (${fmt(r.per100g?.energy_kcal ?? 0, 0)} kcal em 100 g). Ela já aparece na busca do plano alimentar.`);
      else {
        setErrors(r.fields ?? {});
        setMessage(r.message);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate aria-label={initial ? `Editar ${initial.name}` : 'Nova preparação'} className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-semibold">{initial ? 'Editar preparação' : 'Nova preparação'}</h2>
      {message && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rf-name">Nome</Label>
          <Input id="rf-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rf-group">Grupo</Label>
          <Input id="rf-group" value={group} maxLength={80} onChange={(e) => setGroup(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Ingredientes</p>
        {lines.length > 0 && (
          <ul className="space-y-2" aria-label="Ingredientes">
            {lines.map((l, i) => (
              <li key={`${l.food.id}-${i}`} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {l.food.name}
                  {foodOriginLabel(l.food) && <span className="ml-1 text-xs text-muted-foreground">({foodOriginLabel(l.food)})</span>}
                </span>
                <Label htmlFor={`rf-q-${i}`} className="sr-only">Quantidade de {l.food.name} em gramas</Label>
                <Input id={`rf-q-${i}`} inputMode="decimal" value={l.quantity} className="w-24 text-right" onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                <span className="text-xs text-muted-foreground">g</span>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${l.food.name}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        )}
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Adicionar ingrediente (ex.: farinha de trigo)" aria-label="Buscar ingrediente" className="pl-9" />
          {q.trim().length >= 2 && found.length > 0 && (
            <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              {found.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => {
                      setLines((ls) => [...ls, { food: f, quantity: String(f.householdMeasures[0]?.grams ?? 100) }]);
                      setQ('');
                      setFound([]);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {f.name}
                    {foodOriginLabel(f) && <span className="ml-1 text-xs text-muted-foreground">({foodOriginLabel(f)})</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {errors.items && <p className="text-sm text-destructive">{errors.items}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="rf-yield">Rendimento: peso pronto (g)</Label>
          <Input id="rf-yield" inputMode="decimal" value={yieldG} onChange={(e) => setYieldG(e.target.value)} aria-invalid={Boolean(errors.yield_g)} />
          <p className="text-xs text-muted-foreground">Ingredientes somam {fmt(totalIngredients, 0)} g. Pese depois de pronto: o cozimento ganha ou perde água.</p>
          {errors.yield_g && <p className="text-sm text-destructive">{errors.yield_g}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rf-servings">Porções (opcional)</Label>
          <Input id="rf-servings" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="rf-prep">Tempo de preparo (min, opcional)</Label>
          <Input id="rf-prep" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} aria-invalid={Boolean(errors.prep_minutes)} />
          {errors.prep_minutes && <p className="text-sm text-destructive">{errors.prep_minutes}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rf-difficulty">Dificuldade (opcional)</Label>
          <select id="rf-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | '')} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">—</option>
            {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rf-tags">Tags (separadas por vírgula)</Label>
          <Input id="rf-tags" value={tagsText} placeholder="café da manhã, sem lactose" onChange={(e) => setTagsText(e.target.value)} aria-invalid={Boolean(errors.tags)} />
          {errors.tags && <p className="text-sm text-destructive">{errors.tags}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rf-description">Descrição curta (opcional, aparece para o paciente)</Label>
        <textarea id="rf-description" rows={2} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Foto (opcional)</p>
        <div className="flex flex-wrap items-center gap-3">
          {(photo !== 'keep' && photo !== 'remove') || (photo === 'keep' && initial?.has_image) ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local ou rota privada
            <img src={photo !== 'keep' && photo !== 'remove' ? photo : `/api/receitas/${initial!.id}/foto?v=${photoVersion}`} alt="Foto da receita" className="size-24 rounded-lg object-cover" />
          ) : null}
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-muted">
            <ImagePlus className="size-4" aria-hidden="true" /> {initial?.has_image || (photo !== 'keep' && photo !== 'remove') ? 'Trocar foto' : 'Escolher foto'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Foto da receita"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setPhotoError(null);
                try {
                  setPhoto(await resizeImage(f));
                } catch (err) {
                  setPhotoError(err instanceof Error ? err.message : 'Não foi possível ler a foto.');
                }
              }} />
          </label>
          {(initial?.has_image && photo !== 'remove') || (photo !== 'keep' && photo !== 'remove') ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(initial?.has_image ? 'remove' : 'keep')}>Remover foto</Button>
          ) : null}
        </div>
        {photoError && <p className="text-sm text-destructive">{photoError}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rf-instructions">Modo de preparo (opcional)</Label>
        <textarea id="rf-instructions" rows={4} maxLength={4000} value={instructions} onChange={(e) => setInstructions(e.target.value)} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
      </div>

      {preview && (
        <div className="rounded-xl bg-muted/50 p-3 text-sm" role="status" aria-live="polite">
          <p className="font-medium">Em 100 g da preparação pronta:</p>
          <p className="mt-1 tabular-nums text-muted-foreground">
            {fmt(preview.per100g.energy_kcal ?? 0, 0)} kcal · proteínas {fmt(preview.per100g.protein_g ?? 0)} g · carboidratos {fmt(preview.per100g.carbohydrate_g ?? 0)} g · gorduras {fmt(preview.per100g.lipid_g ?? 0)} g
          </p>
          {servings && toNum(servings) > 0 && toNum(yieldG) > 0 && (
            <p className="text-xs text-muted-foreground">1 porção ≈ {fmt(toNum(yieldG) / toNum(servings), 0)} g</p>
          )}
          {preview.incomplete.length > 0 && <p className="text-xs text-muted-foreground">Algum ingrediente não tem todos os nutrientes na tabela: alguns totais são mínimos.</p>}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar preparação</Button>
      </div>
    </form>
  );
}
