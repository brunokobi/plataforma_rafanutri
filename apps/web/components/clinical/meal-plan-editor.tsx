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
  type Sex,
} from '@rafanutri/nutrition-core';
import { ArrowLeftRight, FileDown, Info, Loader2, MessageCircle, Plus, Save, Search, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DemoMeal } from '@/lib/demo/foods';
import { foodsInGroup, searchFoods, type FoodsResult } from '@/lib/foods/actions';
import { recipesForPdf } from '@/lib/foods/custom-actions';
import { planToWhatsappText, whatsappShareLink } from '@/lib/pdf/whatsapp';
import { foodOriginLabel, normalizeSearch, substituteCandidates, type Food } from '@/lib/foods/food';
import { demoPatient } from '@/lib/demo/patient';
import { formatMeasure } from '@/lib/format/measure';
import { demoGuidelines, demoPractice } from '@/lib/demo/practice';
import { buildMealPlanPdfData, type MealPlanPdfData } from '@/lib/pdf/meal-plan-data';
import { DEFAULT_TARGETS, type PlanContent, type PlanTargets } from '@/lib/meal-plans/schema';
import { cn } from '@/lib/utils';

/** Dados do paciente que o editor usa nas metas e no PDF. */
export interface EditorPatient {
  name: string;
  objective: string | null;
  sex: Sex | null;
  ageYears: number | null;
  weightKg: number | null;
  heightCm: number | null;
  /** Celular em E.164, para enviar o plano publicado por WhatsApp. */
  phone?: string | null;
}

const DEMO_EDITOR_PATIENT: EditorPatient = {
  name: demoPatient.name,
  objective: demoPatient.objective,
  sex: demoPatient.sex,
  ageYears: demoPatient.ageYears,
  weightKg: 67.6,
  heightCm: demoPatient.heightCm,
};
const DEMO_TARGETS: PlanTargets = { ...DEFAULT_TARGETS, adjustment: -450 };
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

function measureLabel(food: Food, grams: number) {
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

/** Busca local (base de exemplo, quando o Directus está fora do ar). */
function localSearch(foods: Food[], query: string): FoodsResult {
  const q = normalizeSearch(query);
  if (q.length < 2) return { ok: true, foods: [] };
  return { ok: true, foods: foods.filter((f) => normalizeSearch(f.name).includes(q)).slice(0, 8) };
}

function FoodSearch({ onPick, search }: { onPick: (food: Food) => void; search: (q: string) => Promise<FoodsResult> }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ query: string; foods: Food[]; error: string | null } | null>(null);
  const text = q.trim();
  const active = text.length >= 2;
  // Resultado só vale para o texto que está no campo (evita mostrar resposta de uma busca antiga).
  const current = active && found?.query === text ? found : null;
  const loading = active && !current;
  const results = current?.foods ?? [];
  const error = current?.error ?? null;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await search(text);
      if (!cancelled) setFound({ query: text, foods: r.ok ? r.foods : [], error: r.ok ? null : r.message });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, text, search]);

  const pick = (food: Food) => {
    onPick(food);
    setQ('');
  };

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
            pick(results[0]);
          }
        }}
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Buscando" />}
      {error && <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>}
      {current && !error && results.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Nenhum alimento encontrado para “{q.trim()}”.</p>
      )}
      {results.length > 0 && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => pick(f)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>
                  {f.name}
                  <span className="block text-xs text-muted-foreground">
                    {f.group}
                    {foodOriginLabel(f) ? ` · ${foodOriginLabel(f)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {f.per100g.energy_kcal == null ? 's/ dado' : `${fmt(f.per100g.energy_kcal)} kcal/100 g`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type EditorResult = { ok: boolean; message?: string };

export interface MealPlanEditorProps {
  initialPlan: DemoMeal[];
  initialFoods: Food[];
  /** true quando o Directus está fora do ar e o editor usa a base de exemplo local. */
  offline?: boolean;
  /** Paciente real (padrão: paciente de exemplo). */
  patient?: EditorPatient;
  /** Consultório para o PDF (padrão: consultório de exemplo). */
  practice?: MealPlanPdfData['practice'];
  initialTitle?: string;
  initialMode?: 'quantitative' | 'qualitative';
  initialTargets?: Partial<PlanTargets>;
  initialGuidelines?: string | null;
  /** Substitui o aviso do topo. */
  banner?: ReactNode;
  /** Plano publicado/arquivado: só leitura (o PDF continua disponível). */
  readOnly?: boolean;
  /** Plano publicado: mostra "Enviar por WhatsApp" com o plano em texto. */
  shareable?: boolean;
  onSave?: (content: PlanContent) => Promise<EditorResult>;
  onPublish?: (content: PlanContent) => Promise<EditorResult>;
  pdfFileName?: string;
}

export function MealPlanEditor({
  initialPlan,
  initialFoods,
  offline = false,
  patient,
  practice,
  initialTitle = 'Plano alimentar',
  initialMode = 'quantitative',
  initialTargets,
  initialGuidelines = null,
  banner,
  readOnly = false,
  shareable = false,
  onSave,
  onPublish,
  pdfFileName = 'plano-alimentar.pdf',
}: MealPlanEditorProps) {
  const p = patient ?? DEMO_EDITOR_PATIENT;
  const t0: PlanTargets = { ...(patient ? DEFAULT_TARGETS : DEMO_TARGETS), ...initialTargets };
  const [meals, setMeals] = useState<Meal[]>(initialPlan);
  const [foods, setFoods] = useState<Record<string, Food>>(() => Object.fromEntries(initialFoods.map((f) => [f.id, f])));
  const [groupPools, setGroupPools] = useState<Record<string, string[] | 'loading' | 'error'>>({});
  const foodById = (id: string) => foods[id];
  const remember = (list: Food[]) => setFoods((cur) => ({ ...cur, ...Object.fromEntries(list.map((f) => [f.id, f])) }));
  const search = useMemo(
    () => (offline ? (q: string) => Promise.resolve(localSearch(initialFoods, q)) : searchFoods),
    [offline, initialFoods],
  );

  async function loadGroup(group: string) {
    if (offline || groupPools[group]) return;
    setGroupPools((g) => ({ ...g, [group]: 'loading' }));
    const r = await foodsInGroup(group);
    if (r.ok) {
      remember(r.foods);
      setGroupPools((g) => ({ ...g, [group]: r.foods.map((f) => f.id) }));
    } else {
      setGroupPools((g) => ({ ...g, [group]: 'error' }));
    }
  }

  function substitutePool(food: Food): Food[] {
    const pool = groupPools[food.group];
    if (offline || !Array.isArray(pool)) return substituteCandidates(food, Object.values(foods));
    return substituteCandidates(food, pool.map((id) => foods[id]).filter((f): f is Food => Boolean(f)));
  }
  const [mode, setMode] = useState<'quantitative' | 'qualitative'>(initialMode);
  const [formula, setFormula] = useState<FormulaKey>(t0.formula);
  const [activity, setActivity] = useState(t0.activity);
  const [adjustment, setAdjustment] = useState(t0.adjustment);
  const [proteinPerKg, setProteinPerKg] = useState(t0.proteinPerKg);
  const [lipidPct, setLipidPct] = useState(t0.lipidPct);
  const [manualKcal, setManualKcal] = useState(t0.manualKcal);
  const [title, setTitle] = useState(initialTitle);
  const [guidelines, setGuidelines] = useState(initialGuidelines ?? '');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const snapshot = (): PlanContent => ({
    title: title.trim() || 'Plano alimentar',
    mode,
    targets: { formula, activity, adjustment, proteinPerKg, lipidPct, manualKcal },
    meals: meals.map((m) => ({
      id: m.id,
      name: m.name,
      time: m.time,
      items: m.items.map((i) => ({ key: i.key, foodId: i.foodId, quantityG: i.quantityG, ...(i.subs?.length ? { subs: i.subs } : {}) })),
    })),
    guidelines: guidelines.trim() || null,
  });

  function run(action: (c: PlanContent) => Promise<EditorResult>, okText: string) {
    setStatus(null);
    startSaving(async () => {
      const r = await action(snapshot());
      setStatus(r.ok ? { kind: 'ok', text: okText } : { kind: 'error', text: r.message ?? 'Não foi possível concluir.' });
    });
  }
  const [subsFor, setSubsFor] = useState<string | null>(null);
  const [showKcalPdf, setShowKcalPdf] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  /** Dados do plano para o PDF e para o WhatsApp (com as preparações do consultório usadas no plano). */
  async function planData() {
    const recipeIds = [...new Set(meals.flatMap((m) => m.items.flatMap((i) => [i.foodId, ...(i.subs ?? []).map((x) => x.foodId)])))].filter((id) => foods[id]?.kind === 'recipe');
    const recipes = recipeIds.length ? await recipesForPdf(recipeIds).catch(() => ({})) : {};
    return buildMealPlanPdfData(meals, {
        recipes,
        foodById,
        mode,
        showKcal: showKcalPdf,
        practice: practice ?? demoPractice,
        patient: { name: p.name, objective: p.objective ?? '' },
        guidelines: guidelines.trim() ? guidelines.split('\n').map((g) => g.trim()).filter(Boolean) : patient ? [] : demoGuidelines,
      });
  }

  async function shareWhatsapp() {
    // A janela abre no próprio clique (senão o bloqueador de pop-ups barra) e recebe o link depois.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    const data = await planData();
    const firstName = p.name.split(/\s+/)[0] ?? p.name;
    const link = whatsappShareLink(patient?.phone ?? null, planToWhatsappText(data, firstName));
    if (win) win.location.href = link;
    else window.location.href = link;
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const [{ pdf }, { MealPlanDocument }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/pdf/meal-plan-document')]);
      const data = await planData();
      const blob = await pdf(<MealPlanDocument data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = patient ? pdfFileName : 'plano-alimentar-marina-costa.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setPdfBusy(false);
    }
  }

  // Gasto energético só com sexo, idade (adulto), peso e altura; senão, meta informada à mão.
  const ree = (() => {
    if (!p.sex || p.ageYears === null || p.ageYears < 18 || !p.weightKg || !p.heightCm) return null;
    try {
      return FORMULAS[formula].fn({ sex: p.sex, weightKg: p.weightKg, heightCm: p.heightCm, ageYears: p.ageYears });
    } catch {
      return null;
    }
  })();
  const tee = ree !== null ? totalEnergyExpenditure(ree, activity) : null;
  const target = tee !== null ? Math.max(1000, tee + adjustment) : manualKcal;
  const macroWeight = p.weightKg ?? 60;
  const proteinKcal = p.weightKg ? proteinPerKg * p.weightKg * 4 : target * 0.2;
  const carbPct = Math.max(0, 100 - lipidPct - (proteinKcal / target) * 100);
  const macros = macroDistribution(
    {
      protein: p.weightKg ? { mode: 'g_per_kg', value: proteinPerKg } : { mode: 'pct', value: 20 },
      lipid: { mode: 'pct', value: lipidPct },
      carbohydrate: { mode: 'pct', value: carbPct },
    },
    target,
    macroWeight,
  );

  const totals = useMemo(
    () =>
      computePlanTotals(
        meals.map((m) => ({
          id: m.id,
          items: m.items.map((i) => ({ quantityG: i.quantityG, per100g: foods[i.foodId]?.per100g ?? {} })),
        })),
      ),
    [meals, foods],
  );
  const day = totals.day.totals;

  const updateItem = (mealId: string, key: string, patch: Partial<Item>) =>
    setMeals((ms) => ms.map((m) => (m.id === mealId ? { ...m, items: m.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) } : m)));
  const removeItem = (mealId: string, key: string) =>
    setMeals((ms) => ms.map((m) => (m.id === mealId ? { ...m, items: m.items.filter((i) => i.key !== key) } : m)));
  const addItem = (mealId: string, food: Food) => {
    remember([food]);
    setMeals((ms) =>
      ms.map((m) =>
        m.id === mealId
          ? { ...m, items: [...m.items, { key: `${food.id}-${Date.now()}`, foodId: food.id, quantityG: food.householdMeasures[0]?.grams ?? 100 }] }
          : m,
      ),
    );
  };

  const quantitative = mode === 'quantitative';

  return (
    <div className="space-y-6">
      {banner ?? (offline ? (
        <Alert>
          <Info />
          <AlertTitle>Base de alimentos indisponível: usando a base de exemplo</AlertTitle>
          <AlertDescription>
            Não foi possível falar com a base de alimentos agora. Os alimentos abaixo têm valores aproximados e não servem para uso clínico. Nada é
            salvo.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <Info />
          <AlertTitle>Alimentos da TACO 4ª edição</AlertTitle>
          <AlertDescription>
            Composição por 100 g da Tabela Brasileira de Composição de Alimentos (NEPA/UNICAMP, 2011). A paciente é fictícia e o plano ainda não é
            salvo. Medidas caseiras cadastradas só para os alimentos mais comuns; nos demais, a quantidade aparece em gramas.
          </AlertDescription>
        </Alert>
      ))}

      {(onSave || readOnly) && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="plan-title">Título do plano</Label>
            <Input id="plan-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} disabled={readOnly} className="h-10" />
          </div>
          {onSave && !readOnly && (
            <Button type="button" variant="outline" disabled={saving} onClick={() => run(onSave, 'Rascunho salvo.')}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar rascunho
            </Button>
          )}
          {status && (
            <p role="status" className={cn('w-full text-sm', status.kind === 'ok' ? 'text-primary' : 'text-destructive')}>{status.text}</p>
          )}
        </div>
      )}

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
              {shareable && (
                <Button type="button" variant="outline" onClick={() => void shareWhatsapp()}>
                  <MessageCircle className="size-4" /> Enviar por WhatsApp
                </Button>
              )}
              <Button
                type="button"
                disabled={!onPublish || readOnly || saving}
                title={!onPublish ? 'Demonstração: o plano não é publicado' : readOnly ? 'Plano já publicado ou arquivado' : undefined}
                onClick={() => {
                  if (onPublish && window.confirm('Publicar este plano? Depois de publicado ele não pode ser editado (você pode criar uma nova versão), e o plano publicado anterior é arquivado.')) {
                    run(onPublish, 'Plano publicado.');
                  }
                }}
              >
                <Send className="size-4" /> {readOnly ? 'Publicado' : 'Publicar para o paciente'}
              </Button>
            </div>
          </div>

          <fieldset disabled={readOnly} className="contents">
          {meals.map((meal) => {
            const mealKcal = totals.meals[meal.id]?.totals.energy_kcal ?? 0;
            return (
              <section key={meal.id} aria-labelledby={`meal-${meal.id}`} className="rounded-2xl border border-border bg-card">
                <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                  <h2 id={`meal-${meal.id}`} className="font-semibold">
                    <span className="mr-2 tabular-nums text-muted-foreground">{meal.time}</span>
                    {meal.name}
                  </h2>
                  {quantitative && (
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {fmt(mealKcal)} kcal · {fmt(totals.energyShareByMeal[meal.id] ?? 0)}% do dia
                    </span>
                  )}
                </header>
                <ul className="divide-y divide-border">
                  {meal.items.map((item) => {
                    const food = foodById(item.foodId)!;
                    const ranked = subsFor === item.key ? rankSubstitutes({ id: food.id, per100g: food.per100g }, item.quantityG, substitutePool(food).map((f) => ({ id: f.id, per100g: f.per100g, householdMeasures: f.householdMeasures })), 'energy_kcal').slice(0, 4) : [];
                    const poolState = groupPools[food.group];
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
                            onClick={() => {
                              setSubsFor((k) => (k === item.key ? null : item.key));
                              void loadGroup(food.group);
                            }}
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
                            {poolState === 'loading' ? (
                              <p className="mt-2 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Buscando equivalentes na TACO…</p>
                            ) : poolState === 'error' ? (
                              <p className="mt-2 text-sm text-destructive">Não foi possível buscar equivalentes agora.</p>
                            ) : ranked.length === 0 ? (
                              <p className="mt-2 text-sm">Nenhum equivalente encontrado neste grupo.</p>
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
                  <FoodSearch onPick={(f) => addItem(meal.id, f)} search={search} />
                </div>
              </section>
            );
          })}
          </fieldset>
          {!readOnly && (
            <Button type="button" variant="outline" disabled title="Em breve">
              <Plus className="size-4" /> Nova refeição
            </Button>
          )}
          {(onSave || readOnly) && (
            <div className="space-y-1.5">
              <Label htmlFor="plan-guidelines">Orientações para o paciente (uma por linha; vão no PDF)</Label>
              <textarea
                id="plan-guidelines"
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
                rows={4}
                maxLength={4000}
                disabled={readOnly}
                className="w-full rounded-md border border-input bg-transparent p-3 text-sm dark:bg-input/30"
              />
            </div>
          )}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section aria-labelledby="metas" className="rounded-2xl border border-border bg-card p-5">
            <h2 id="metas" className="font-semibold">Gasto energético e metas</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {[p.name, p.ageYears !== null ? `${p.ageYears} anos` : null, p.weightKg ? `${fmt(p.weightKg, 1)} kg` : null, p.heightCm ? `${fmt(p.heightCm)} cm` : null].filter(Boolean).join(', ')}
            </p>
            {ree === null && (
              <p className="mt-2 rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                Para calcular o gasto energético, informe sexo e nascimento na ficha e registre uma avaliação com peso e altura. Enquanto isso, use a meta manual.
              </p>
            )}
            <fieldset disabled={readOnly} className="mt-4 grid grid-cols-2 gap-3">
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
            </fieldset>
            {ree === null && (
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="manual-kcal">Meta manual (kcal)</Label>
                <Input id="manual-kcal" disabled={readOnly} type="number" step={50} min={600} max={6000} value={manualKcal} onChange={(e) => setManualKcal(Number(e.target.value) || 0)} className="h-9 tabular-nums" />
              </div>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-muted/60 p-2"><dt className="text-muted-foreground">GER</dt><dd className="text-sm font-semibold tabular-nums">{ree !== null ? fmt(ree) : '—'}</dd></div>
              <div className="rounded-lg bg-muted/60 p-2"><dt className="text-muted-foreground">GET</dt><dd className="text-sm font-semibold tabular-nums">{tee !== null ? fmt(tee) : '—'}</dd></div>
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
