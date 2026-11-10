'use client';

import {
  adequacy,
  computePlanTotals,
  faoWho1985,
  harrisBenedict,
  macroDistribution,
  mifflinStJeor,
  rankSubstitutes,
  roundToHouseholdMeasure,
  totalEnergyExpenditure,
  type EnergyInput,
} from '@rafanutri/nutrition-core';
import { ArrowLeftRight, FileDown, Info, Loader2, Plus, Search, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEMO_FOODS, DEMO_PLAN, foodById, searchDemoFoods, type DemoFood, type DemoMeal } from '@/lib/demo/foods';
import { demoPatient } from '@/lib/demo/patient';
import { formatMeasure } from '@/lib/format/measure';
import { demoGuidelines, demoPractice } from '@/lib/demo/practice';
import { buildMealPlanPdfData } from '@/lib/pdf/meal-plan-data';
import { cn } from '@/lib/utils';

const WEIGHT_KG = 67.6;
const FORMULAS = {
  mifflin: { label: 'Mifflin-St Jeor', fn: mifflinStJeor },
  harris: { label: 'Harris-Benedict', fn: harrisBenedict },
  fao: { label: 'FAO/OMS 1985', fn: faoWho1985 },
} as const;
type FormulaKey = keyof typeof FORMULAS;
const ACTIVITY = [
  { value: 1.2, label: 'Sedentário (1,2)' },
  { value: 1.375, label: 'Leve (1,375)' },
  { value: 1.55, label: 'Moderado (1,55)' },
  { value: 1.725, label: 'Intenso (1,725)' },
];

const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

type Sub = { foodId: string; quantityG: number };
type Item = DemoMeal['items'][number] & { subs?: Sub[] };
type Meal = Omit<DemoMeal, 'items'> & { items: Item[] };

function measureLabel(food: DemoFood, grams: number) {
  const r = roundToHouseholdMeasure(grams, food.householdMeasures);
  return r.measure ? formatMeasure(r.measure.quantity, r.measure.label) : `${fmt(grams)} g`;
}

function AdequacyBar({ label, total, target, unit, minimum = false }: { label: string; total: number; target: number; unit: string; minimum?: boolean }) {
  const raw = adequacy(total, target);
  // Metas mínimas (ex.: fibras): passar da meta é adequado.
  const a = minimum && raw.band === 'above' ? { ...raw, band: 'adequate' as const } : raw;
  const width = Math.min(a.pct, 130) / 1.3;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{fmt(total, unit === 'kcal' ? 0 : 1)}</span> / {fmt(target, unit === 'kcal' ? 0 : 1)} {unit}
        </span>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${label}: ${fmt(a.pct)}% da meta`}>
        <div
          className={cn('h-full rounded-full transition-all', a.band === 'adequate' ? 'bg-primary' : a.band === 'below' ? 'bg-lemon' : 'bg-tomato')}
          style={{ width: `${width}%` }}
        />
        <span className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${100 / 1.3}%` }} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {fmt(a.pct)}% {a.band === 'adequate' ? '· adequado' : a.band === 'below' ? '· abaixo da meta' : '· acima da meta'}
      </p>
    </div>
  );
}

function FoodSearch({ onPick }: { onPick: (food: DemoFood) => void }) {
  const [q, setQ] = useState('');
  const results = searchDemoFoods(q);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Adicionar alimento (ex.: arroz, ovo, banana)"
        aria-label="Buscar alimento"
        className="h-10 pl-9"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            e.preventDefault();
            onPick(results[0]);
            setQ('');
          }
        }}
      />
      {results.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {results.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  onPick(f);
                  setQ('');
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmt(f.per100g.energy_kcal ?? 0)} kcal/100 g</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MealPlanEditor() {
  const [meals, setMeals] = useState<Meal[]>(DEMO_PLAN);
  const [mode, setMode] = useState<'quantitative' | 'qualitative'>('quantitative');
  const [formula, setFormula] = useState<FormulaKey>('mifflin');
  const [activity, setActivity] = useState(1.55);
  const [adjustment, setAdjustment] = useState(-450);
  const [proteinPerKg, setProteinPerKg] = useState(1.6);
  const [lipidPct, setLipidPct] = useState(28);
  const [subsFor, setSubsFor] = useState<string | null>(null);
  const [showKcalPdf, setShowKcalPdf] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const [{ pdf }, { MealPlanDocument }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/pdf/meal-plan-document')]);
      const data = buildMealPlanPdfData(meals, {
        mode,
        showKcal: showKcalPdf,
        practice: demoPractice,
        patient: { name: demoPatient.name, objective: demoPatient.objective },
        guidelines: demoGuidelines,
      });
      const blob = await pdf(<MealPlanDocument data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plano-alimentar-marina-costa.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setPdfBusy(false);
    }
  }

  const energy: EnergyInput = { sex: demoPatient.sex, weightKg: WEIGHT_KG, heightCm: demoPatient.heightCm, ageYears: demoPatient.ageYears };
  const ree = FORMULAS[formula].fn(energy);
  const tee = totalEnergyExpenditure(ree, activity);
  const target = Math.max(1000, tee + adjustment);
  const proteinKcal = proteinPerKg * WEIGHT_KG * 4;
  const carbPct = Math.max(0, 100 - lipidPct - (proteinKcal / target) * 100);
  const macros = macroDistribution(
    { protein: { mode: 'g_per_kg', value: proteinPerKg }, lipid: { mode: 'pct', value: lipidPct }, carbohydrate: { mode: 'pct', value: carbPct } },
    target,
    WEIGHT_KG,
  );

  const totals = useMemo(
    () =>
      computePlanTotals(
        meals.map((m) => ({
          id: m.id,
          items: m.items.map((i) => ({ quantityG: i.quantityG, per100g: foodById(i.foodId)!.per100g })),
        })),
      ),
    [meals],
  );
  const day = totals.day.totals;

  const updateItem = (mealId: string, key: string, patch: Partial<Item>) =>
    setMeals((ms) => ms.map((m) => (m.id === mealId ? { ...m, items: m.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) } : m)));
  const removeItem = (mealId: string, key: string) =>
    setMeals((ms) => ms.map((m) => (m.id === mealId ? { ...m, items: m.items.filter((i) => i.key !== key) } : m)));
  const addItem = (mealId: string, food: DemoFood) =>
    setMeals((ms) =>
      ms.map((m) =>
        m.id === mealId
          ? { ...m, items: [...m.items, { key: `${food.id}-${Date.now()}`, foodId: food.id, quantityG: food.householdMeasures[0]?.grams ?? 100 }] }
          : m,
      ),
    );

  const quantitative = mode === 'quantitative';

  return (
    <div className="space-y-6">
      <Alert>
        <Info />
        <AlertTitle>Demonstração com base de alimentos de exemplo</AlertTitle>
        <AlertDescription>
          Os cálculos usam as fórmulas reais da Rafanutri, mas os alimentos têm valores aproximados e não servem para uso clínico. A tabela TACO
          completa entra na importação da base. Nada é salvo.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="radiogroup" aria-label="Modo do plano" className="inline-flex rounded-lg border border-border p-1">
              {[
                ['quantitative', 'Quantitativo'],
                ['qualitative', 'Qualitativo (sem números)'],
              ].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={mode === v}
                  onClick={() => setMode(v as typeof mode)}
                  className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition', mode === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {quantitative && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={showKcalPdf} onChange={(e) => setShowKcalPdf(e.target.checked)} className="size-4 accent-[var(--primary)]" />
                  Mostrar calorias no PDF
                </label>
              )}
              <Button type="button" variant="outline" onClick={downloadPdf} disabled={pdfBusy} aria-busy={pdfBusy}>
                {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Baixar PDF
              </Button>
              <Button type="button" disabled title="Pré-lançamento: o plano ainda não é publicado">
                <Send className="size-4" /> Publicar para a paciente
              </Button>
            </div>
          </div>

          {meals.map((meal) => {
            const mealKcal = totals.meals[meal.id]?.totals.energy_kcal ?? 0;
            return (
              <section key={meal.id} aria-labelledby={`meal-${meal.id}`} className="rounded-2xl border border-border bg-card">
                <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                  <h3 id={`meal-${meal.id}`} className="font-semibold">
                    <span className="mr-2 tabular-nums text-muted-foreground">{meal.time}</span>
                    {meal.name}
                  </h3>
                  {quantitative && (
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {fmt(mealKcal)} kcal · {fmt(totals.energyShareByMeal[meal.id] ?? 0)}% do dia
                    </span>
                  )}
                </header>
                <ul className="divide-y divide-border">
                  {meal.items.map((item) => {
                    const food = foodById(item.foodId)!;
                    const ranked = subsFor === item.key ? rankSubstitutes({ id: food.id, per100g: food.per100g }, item.quantityG, DEMO_FOODS.filter((f) => f.group === food.group).map((f) => ({ id: f.id, per100g: f.per100g, householdMeasures: f.householdMeasures })), 'energy_kcal').slice(0, 4) : [];
                    return (
                      <li key={item.key} className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{food.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {quantitative ? `${measureLabel(food, item.quantityG)} · ${fmt(((food.per100g.energy_kcal ?? 0) * item.quantityG) / 100)} kcal` : food.group}
                            </p>
                          </div>
                          {quantitative && (
                            <div className="flex items-center gap-1.5">
                              <Label htmlFor={`q-${item.key}`} className="sr-only">Quantidade de {food.name} em gramas</Label>
                              <Input
                                id={`q-${item.key}`}
                                type="number"
                                min={0}
                                step={5}
                                value={item.quantityG}
                                onChange={(e) => updateItem(meal.id, item.key, { quantityG: Math.max(0, Number(e.target.value) || 0) })}
                                className="h-9 w-20 text-right tabular-nums"
                              />
                              <span className="text-xs text-muted-foreground">g</span>
                            </div>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-expanded={subsFor === item.key}
                            onClick={() => setSubsFor((k) => (k === item.key ? null : item.key))}
                          >
                            <ArrowLeftRight className="size-4" /> Substituições{item.subs?.length ? ` (${item.subs.length})` : ''}
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${food.name}`} onClick={() => removeItem(meal.id, item.key)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        {item.subs && item.subs.length > 0 && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Ou: </span>
                            {item.subs.map((s) => `${measureLabel(foodById(s.foodId)!, s.quantityG)} de ${foodById(s.foodId)!.name.toLowerCase()}`).join(' · ')}
                          </p>
                        )}
                        {subsFor === item.key && (
                          <div className="mt-3 rounded-xl bg-muted/50 p-3">
                            <p className="text-xs font-medium text-muted-foreground">Equivalentes em energia, mesmo grupo ({food.group.toLowerCase()}):</p>
                            {ranked.length === 0 ? (
                              <p className="mt-2 text-sm">Nenhum equivalente na base de exemplo.</p>
                            ) : (
                              <ul className="mt-2 space-y-1.5">
                                {ranked.map(({ food: f, result }) => {
                                  const sf = foodById(f.id)!;
                                  const already = item.subs?.some((s) => s.foodId === f.id);
                                  const dp = result.delta.protein_g ?? 0;
                                  return (
                                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                      <span>
                                        <span className="font-medium">{sf.name}</span>
                                        <span className="text-muted-foreground"> · {measureLabel(sf, result.quantityG)} ({fmt(result.quantityG)} g)</span>
                                        <span className="ml-1 text-xs text-muted-foreground">proteína {dp >= 0 ? '+' : ''}{fmt(dp, 1)} g</span>
                                      </span>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={already}
                                        onClick={() => updateItem(meal.id, item.key, { subs: [...(item.subs ?? []), { foodId: f.id, quantityG: result.quantityG }] })}
                                      >
                                        {already ? 'Adicionado' : 'Adicionar'}
                                      </Button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="border-t border-border px-5 py-3">
                  <FoodSearch onPick={(f) => addItem(meal.id, f)} />
                </div>
              </section>
            );
          })}
          <Button type="button" variant="outline" disabled title="Em breve">
            <Plus className="size-4" /> Nova refeição
          </Button>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section aria-labelledby="metas" className="rounded-2xl border border-border bg-card p-5">
            <h2 id="metas" className="font-semibold">Gasto energético e metas</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {demoPatient.name}, {demoPatient.ageYears} anos, {fmt(WEIGHT_KG, 1)} kg, {demoPatient.heightCm} cm
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="formula">Fórmula</Label>
                <select id="formula" value={formula} onChange={(e) => setFormula(e.target.value as FormulaKey)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30">
                  {Object.entries(FORMULAS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="activity">Fator de atividade</Label>
                <select id="activity" value={activity} onChange={(e) => setActivity(Number(e.target.value))} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30">
                  {ACTIVITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj">Ajuste (kcal)</Label>
                <Input id="adj" type="number" step={50} value={adjustment} onChange={(e) => setAdjustment(Number(e.target.value) || 0)} className="h-9 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ptn">Proteína (g/kg)</Label>
                <Input id="ptn" type="number" step={0.1} min={0.6} max={3} value={proteinPerKg} onChange={(e) => setProteinPerKg(Number(e.target.value) || 0)} className="h-9 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lip">Lipídios (%)</Label>
                <Input id="lip" type="number" step={1} min={10} max={45} value={lipidPct} onChange={(e) => setLipidPct(Number(e.target.value) || 0)} className="h-9 tabular-nums" />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-muted/60 p-2"><dt className="text-muted-foreground">GER</dt><dd className="text-sm font-semibold tabular-nums">{fmt(ree)}</dd></div>
              <div className="rounded-lg bg-muted/60 p-2"><dt className="text-muted-foreground">GET</dt><dd className="text-sm font-semibold tabular-nums">{fmt(tee)}</dd></div>
              <div className="rounded-lg bg-primary/10 p-2"><dt className="text-primary">Meta</dt><dd className="text-sm font-semibold tabular-nums">{fmt(target)}</dd></div>
            </dl>
          </section>

          <section aria-labelledby="totais" className="rounded-2xl border border-border bg-card p-5">
            <h2 id="totais" className="font-semibold">Plano × metas</h2>
            {quantitative ? (
              <div className="mt-4 space-y-4">
                <AdequacyBar label="Energia" total={day.energy_kcal ?? 0} target={target} unit="kcal" />
                <AdequacyBar label="Proteína" total={day.protein_g ?? 0} target={macros.protein.grams} unit="g" />
                <AdequacyBar label="Carboidrato" total={day.carbohydrate_g ?? 0} target={macros.carbohydrate.grams} unit="g" />
                <AdequacyBar label="Lipídios" total={day.lipid_g ?? 0} target={macros.lipid.grams} unit="g" />
                <AdequacyBar label="Fibras (mínimo)" total={day.fiber_g ?? 0} target={25} unit="g" minimum />
                {totals.day.incomplete.length > 0 && (
                  <p className="text-xs text-muted-foreground">Alguns alimentos não têm dado de fibra; o total de fibras é um valor mínimo.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No modo qualitativo a paciente vê porções e orientações, sem calorias. Os cálculos continuam disponíveis para você no modo quantitativo.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
