'use client';

import { AlertCircle, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveCustomFood, type CustomFoodInput } from '@/lib/foods/custom-actions';
import type { Food } from '@/lib/foods/food';
import { searchFoods } from '@/lib/foods/actions';
import { cn } from '@/lib/utils';

export const NUTRIENT_FIELDS = [
  { code: 'energy_kcal', label: 'Energia', unit: 'kcal', required: true },
  { code: 'protein_g', label: 'Proteínas', unit: 'g' },
  { code: 'carbohydrate_g', label: 'Carboidratos', unit: 'g' },
  { code: 'lipid_g', label: 'Gorduras totais', unit: 'g' },
  { code: 'saturated_fat_g', label: 'Gorduras saturadas', unit: 'g' },
  { code: 'fiber_g', label: 'Fibra alimentar', unit: 'g' },
  { code: 'sodium_mg', label: 'Sódio', unit: 'mg' },
] as const;

const toNum = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Prévia da conversão porção → 100 g (o servidor recalcula e valida). */
export function portionTo100g(value: number | null, portionG: number | null): number | null {
  if (value === null || !portionG || portionG <= 0) return null;
  return Math.round(((value * 100) / portionG) * 100) / 100;
}

type Measure = { label: string; grams: string };

export function CustomFoodForm({ initial, onDone, onCancel }: { initial?: Food; onDone: (msg: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [group, setGroup] = useState(initial?.group && initial.group !== 'Outros' ? initial.group : '');
  const [basis, setBasis] = useState<'100g' | 'portion'>(initial ? '100g' : 'portion');
  const [portion, setPortion] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f.code, initial?.per100g[f.code] == null ? '' : String(initial.per100g[f.code]).replace('.', ',')])),
  );
  const [measures, setMeasures] = useState<Measure[]>(initial?.householdMeasures.map((m) => ({ label: m.label, grams: String(m.grams) })) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // "Copiar valores da TACO"
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Food[]>([]);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await searchFoods(text);
      if (!cancelled) setFound(r.ok ? r.foods.filter((f) => f.source !== 'CUSTOM' && f.kind !== 'recipe').slice(0, 6) : []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);
  const copyFrom = (f: Food) => {
    setName((n) => n || `${f.name} (ajustado)`);
    setBasis('100g');
    setValues((cur) => ({ ...cur, ...Object.fromEntries(NUTRIENT_FIELDS.map((x) => [x.code, f.per100g[x.code] == null ? cur[x.code] ?? '' : String(f.per100g[x.code]).replace('.', ',')])) }));
    if (f.householdMeasures.length) setMeasures(f.householdMeasures.map((m) => ({ label: m.label, grams: String(m.grams) })));
    if (!group) setGroup(f.group);
    setQ('');
    setFound([]);
  };

  const portionG = toNum(portion);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setMessage(null);
    const input: CustomFoodInput = {
      name,
      food_group: group,
      basis,
      portion_g: basis === 'portion' ? portion : undefined,
      nutrients: Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f.code, values[f.code] ?? ''])),
      household_measures: measures.filter((m) => m.label.trim() || m.grams.trim()),
    };
    startTransition(async () => {
      const r = await saveCustomFood(input, initial?.id);
      if (r.ok) onDone(initial ? 'Alimento atualizado.' : 'Alimento cadastrado. Ele já aparece na busca do plano alimentar.');
      else {
        setErrors(r.fields ?? {});
        setMessage(r.message);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate aria-label={initial ? `Editar ${initial.name}` : 'Novo alimento'} className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-semibold">{initial ? 'Editar alimento' : 'Novo alimento'}</h2>
      {message && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {!initial && (
        <div className="relative max-w-md">
          <Label htmlFor="cf-copy" className="text-xs">Copiar valores da TACO para ajustar (opcional)</Label>
          <Search className="pointer-events-none absolute left-3 top-[2.1rem] size-4 text-muted-foreground" aria-hidden="true" />
          <Input id="cf-copy" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: pão de forma" className="mt-1 pl-9" />
          {q.trim().length >= 2 && found.length > 0 && (
            <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              {found.map((f) => (
                <li key={f.id}>
                  <button type="button" role="option" aria-selected="false" onClick={() => copyFrom(f)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cf-name">Nome</Label>
          <Input id="cf-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-group">Grupo (opcional)</Label>
          <Input id="cf-group" value={group} maxLength={80} placeholder="Ex.: Industrializados" onChange={(e) => setGroup(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        <div role="radiogroup" aria-label="Os valores informados são" className="inline-flex rounded-lg border border-border p-1">
          {[['portion', 'Da porção do rótulo'], ['100g', 'Por 100 g']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={basis === v} onClick={() => setBasis(v as typeof basis)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', basis === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {l}
            </button>
          ))}
        </div>
        {basis === 'portion' && (
          <div className="space-y-1.5">
            <Label htmlFor="cf-portion">Porção do rótulo (g)</Label>
            <Input id="cf-portion" inputMode="decimal" value={portion} onChange={(e) => setPortion(e.target.value)} className="w-32" aria-invalid={Boolean(errors.portion_g)} />
            {errors.portion_g && <p className="text-sm text-destructive">{errors.portion_g}</p>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NUTRIENT_FIELDS.map((f) => {
            const per100 = basis === 'portion' ? portionTo100g(toNum(values[f.code] ?? ''), portionG) : null;
            return (
              <div key={f.code} className="space-y-1">
                <Label htmlFor={`cf-${f.code}`} className="text-xs">
                  {f.label} ({f.unit}){'required' in f && f.required ? ' *' : ''}
                </Label>
                <Input id={`cf-${f.code}`} inputMode="decimal" value={values[f.code] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.code]: e.target.value }))} aria-invalid={Boolean(errors[f.code])} />
                {per100 !== null && <p className="text-xs text-muted-foreground">= {fmt(per100)} {f.unit} em 100 g</p>}
                {errors[f.code] && <p className="text-xs text-destructive">{errors[f.code]}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Medidas caseiras (opcional)</p>
        {measures.map((m, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`cf-ml-${i}`} className="text-xs">Medida</Label>
              <Input id={`cf-ml-${i}`} value={m.label} maxLength={40} placeholder="unidade, fatia…" onChange={(e) => setMeasures((ms) => ms.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`cf-mg-${i}`} className="text-xs">Gramas</Label>
              <Input id={`cf-mg-${i}`} inputMode="decimal" value={m.grams} className="w-24" onChange={(e) => setMeasures((ms) => ms.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))} />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remover medida ${m.label}`} onClick={() => setMeasures((ms) => ms.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        {errors.household_measures && <p className="text-sm text-destructive">{errors.household_measures}</p>}
        {measures.length < 10 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setMeasures((ms) => [...ms, { label: '', grams: '' }])}><Plus className="size-4" /> Medida</Button>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar alimento</Button>
      </div>
    </form>
  );
}
