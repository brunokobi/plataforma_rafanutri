'use client';

import { AlertTriangle, CheckCircle2, Copy, Loader2, Plus, Scale, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ALLERGEN_LABEL, brl } from '@/lib/uan/catalog';
import { approveSheet, deleteSheet, duplicateSheet, getSheetGraph, newSheetVersion, saveSheet } from '@/lib/uan/sheet-actions';
import {
  buildInputs,
  calculate,
  NUTRIENT_ROWS,
  scaleItems,
  SHEET_CATEGORY_LABEL,
  SHEET_STATUS_LABEL,
  notAnalyzed,
  sheetAllergens,
  type EditItem,
  type SheetCategory,
  type SheetDetail,
  type SheetGraph,
} from '@/lib/uan/techsheets';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const TEXTAREA = 'min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';
const txt = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const fmt = (n: number, d = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: d });
const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : null;
};

/** Ficha técnica: edição (rascunho) com cálculo ao vivo, ou leitura (aprovada/arquivada). */
export function SheetEditor({ detail }: { detail: SheetDetail }) {
  const router = useRouter();
  const s = detail.sheet;
  const editable = detail.can_edit;
  const saved = detail.graph.sheets.find((x) => x.id === s.id)!;
  const [graph, setGraph] = useState<SheetGraph>(detail.graph);
  const [meta, setMeta] = useState({
    name: s.name, category: s.category, servings: String(s.servings), cooked_weight_g: txt(s.cooked_weight_g), cooking_index: txt(s.cooking_index),
    prep_minutes: txt(s.prep_minutes), equipment: s.equipment ?? '', notes: s.notes ?? '',
  });
  const [items, setItems] = useState<EditItem[]>(() =>
    saved.items.map((i) => ({ ingredient_id: i.ingredient_id, sub_sheet_id: i.sub_sheet_id, gross: txt(i.gross_g), fc: txt(i.fc), note: i.note ?? '' })),
  );
  const [steps, setSteps] = useState(() => detail.steps.map((st) => ({ text: st.text, critical: st.critical, target_temp: txt(st.target_temp) })));
  const [scaleTo, setScaleTo] = useState('');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const catalog = useMemo(() => [...detail.catalog, ...graph.ingredients.filter((g) => !detail.catalog.some((c) => c.id === g.id))], [detail.catalog, graph.ingredients]);
  const ingById = useMemo(() => new Map(catalog.map((i) => [i.id, i])), [catalog]);
  const subName = useMemo(() => new Map([...detail.sub_sheets.map((x) => [x.id, x.name] as const), ...graph.sheets.map((x) => [x.id, x.name] as const)]), [detail.sub_sheets, graph.sheets]);
  const edit = { servings: meta.servings, cooked_weight_g: meta.cooked_weight_g, cooking_index: meta.cooking_index, items };
  const result = calculate(s.id, buildInputs(s.id, graph, catalog, editable ? edit : undefined));
  const allergens = sheetAllergens(s.id, graph, catalog, editable ? items : undefined);
  const cost = detail.can_see_cost;
  const na = notAnalyzed((editable ? items : saved.items).map((i) => i.ingredient_id), catalog);

  const setItem = (i: number, p: Partial<EditItem>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const choose = (i: number, value: string) => {
    if (value.startsWith('s:')) {
      const id = value.slice(2);
      setItem(i, { ingredient_id: null, sub_sheet_id: id, fc: '' });
      if (!graph.sheets.some((x) => x.id === id)) {
        void getSheetGraph(id).then((g) => {
          if (!g) return setMessage({ text: 'Não foi possível carregar a sub-receita.', error: true });
          setGraph((cur) => ({
            sheets: [...cur.sheets, ...g.sheets.filter((x) => !cur.sheets.some((y) => y.id === x.id))],
            ingredients: [...cur.ingredients, ...g.ingredients.filter((x) => !cur.ingredients.some((y) => y.id === x.id))],
          }));
        });
      }
    } else setItem(i, { ingredient_id: value.slice(2) || null, sub_sheet_id: null });
  };
  const payload = () => ({ ...meta, items, steps });
  const save = (then?: () => Promise<void>) =>
    startTransition(async () => {
      setMessage(null);
      const r = await saveSheet(s.id, payload());
      if (!r.ok) return setMessage({ text: r.message, error: true });
      if (then) await then();
      else {
        setMessage({ text: 'Rascunho salvo.' });
        router.refresh();
      }
    });
  const approve = () => {
    if (!result) return setMessage({ text: 'Revise a ficha: o cálculo não fechou.', error: true });
    if (!window.confirm('Aprovar esta ficha? Depois de aprovada ela não muda; alterações viram uma nova versão.')) return;
    save(async () => {
      const r = await approveSheet(s.id, { ...result, allergens });
      if (!r.ok) return setMessage({ text: r.message, error: true });
      setMessage({ text: 'Ficha aprovada.' });
      router.refresh();
    });
  };
  const go = (fn: () => Promise<{ ok: boolean; id?: string; message?: string }>, to?: (id: string) => string) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage({ text: r.message ?? 'Não foi possível concluir.', error: true });
      if (to && r.id) router.push(to(r.id));
      else router.refresh();
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={s.status === 'approved' ? 'default' : 'secondary'}>{SHEET_STATUS_LABEL[s.status]}</Badge>
          <span className="text-sm text-muted-foreground">Versão {s.version}</span>
          {detail.versions.length > 1 && (
            <nav aria-label="Versões" className="flex flex-wrap gap-2 text-sm">
              {detail.versions.filter((v) => v.id !== s.id).map((v) => (
                <Link key={v.id} href={`/app/uan/fichas/${v.id}`} className="text-primary underline">v{v.version} ({SHEET_STATUS_LABEL[v.status].toLowerCase()})</Link>
              ))}
            </nav>
          )}
        </div>

        <fieldset disabled={!editable} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2" aria-label="Dados da ficha">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sh-name">Nome da preparação</Label>
            <Input id="sh-name" maxLength={120} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-cat">Categoria</Label>
            <select id="sh-cat" className={SELECT} value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value as SheetCategory })}>
              {(Object.keys(SHEET_CATEGORY_LABEL) as SheetCategory[]).map((c) => <option key={c} value={c}>{SHEET_CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-serv">Porções</Label>
            <Input id="sh-serv" inputMode="numeric" value={meta.servings} onChange={(e) => setMeta({ ...meta, servings: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-cooked">Peso pronto (g)</Label>
            <Input id="sh-cooked" inputMode="decimal" placeholder="medido após o preparo" value={meta.cooked_weight_g} onChange={(e) => setMeta({ ...meta, cooked_weight_g: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-ic">Índice de cocção (IC)</Label>
            <Input id="sh-ic" inputMode="decimal" placeholder="se não houver peso pronto" value={meta.cooking_index} onChange={(e) => setMeta({ ...meta, cooking_index: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-prep">Tempo de preparo (min)</Label>
            <Input id="sh-prep" inputMode="numeric" value={meta.prep_minutes} onChange={(e) => setMeta({ ...meta, prep_minutes: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-eq">Equipamentos</Label>
            <Input id="sh-eq" maxLength={500} value={meta.equipment} onChange={(e) => setMeta({ ...meta, equipment: e.target.value })} />
          </div>
        </fieldset>

        <section aria-labelledby="ingredientes" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="ingredientes" className="font-display text-xl font-semibold">Ingredientes</h2>
            {editable && (
              <form
                aria-label="Escalar a ficha"
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const from = num(meta.servings);
                  const to = num(scaleTo);
                  if (!from || !to || to < 1) return setMessage({ text: 'Informe as porções desejadas.', error: true });
                  const f = to / from;
                  setItems((l) => scaleItems(l, f));
                  setMeta((m) => ({ ...m, servings: String(Math.round(to)), cooked_weight_g: num(m.cooked_weight_g) ? txt(Math.round(num(m.cooked_weight_g)! * f * 10) / 10) : m.cooked_weight_g }));
                  setMessage({ text: `Pesos multiplicados por ${fmt(f, 3)}. Salve para gravar.` });
                  setScaleTo('');
                }}
              >
                <div className="w-28 space-y-1.5"><Label htmlFor="sh-scale">Escalar para</Label><Input id="sh-scale" inputMode="numeric" placeholder="porções" value={scaleTo} onChange={(e) => setScaleTo(e.target.value)} /></div>
                <Button type="submit" variant="outline" size="sm"><Scale className="size-4" /> Escalar</Button>
              </form>
            )}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">Ingredientes da ficha</caption>
              <thead>
                <tr className="text-muted-foreground">
                  <th className="p-2 font-medium">Insumo ou sub-receita</th>
                  <th className="w-24 p-2 text-right font-medium">PB (g)</th>
                  <th className="w-20 p-2 text-right font-medium">FC</th>
                  <th className="w-20 p-2 text-right font-medium">PL (g)</th>
                  {cost && <th className="w-24 p-2 text-right font-medium">Custo</th>}
                  {editable && <th className="w-10 p-2"><span className="sr-only">Remover</span></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const ing = it.ingredient_id ? ingById.get(it.ingredient_id) : undefined;
                  const gross = num(it.gross) ?? 0;
                  const fc = it.sub_sheet_id ? 1 : (num(it.fc) ?? ing?.default_fc ?? 1);
                  const net = fc >= 1 ? gross / fc : null;
                  const itemCost = cost && ing?.price_per_kg_cents != null ? (ing.price_per_kg_cents * gross) / 1000 : null;
                  const label = it.sub_sheet_id ? `Sub-receita: ${subName.get(it.sub_sheet_id) ?? ''}` : (ing?.name ?? 'Insumo');
                  return (
                    <tr key={i} className="border-t border-border align-top">
                      <td className="p-2">
                        {editable ? (
                          <select aria-label={`Ingrediente ${i + 1}`} className={SELECT} value={it.sub_sheet_id ? `s:${it.sub_sheet_id}` : `i:${it.ingredient_id ?? ''}`} onChange={(e) => choose(i, e.target.value)}>
                            <option value="i:">Escolha…</option>
                            <optgroup label="Insumos">{catalog.map((c) => <option key={c.id} value={`i:${c.id}`}>{c.name}</option>)}</optgroup>
                            {detail.sub_sheets.length > 0 && <optgroup label="Sub-receitas">{detail.sub_sheets.map((x) => <option key={x.id} value={`s:${x.id}`}>{x.name} (v{x.version})</option>)}</optgroup>}
                          </select>
                        ) : (
                          <span>{label}</span>
                        )}
                        {ing && !ing.per100g && <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">Sem vínculo nutricional</span>}
                      </td>
                      <td className="p-2 text-right">
                        {editable ? <Input aria-label={`Peso bruto do ingrediente ${i + 1}`} inputMode="decimal" className="text-right" value={it.gross} onChange={(e) => setItem(i, { gross: e.target.value })} /> : fmt(gross)}
                      </td>
                      <td className="p-2 text-right">
                        {it.sub_sheet_id ? '—' : editable ? <Input aria-label={`FC do ingrediente ${i + 1}`} inputMode="decimal" className="text-right" placeholder={txt(ing?.default_fc ?? 1)} value={it.fc} onChange={(e) => setItem(i, { fc: e.target.value })} /> : fmt(fc, 3)}
                      </td>
                      <td className="p-2 text-right tabular-nums">{net === null ? '—' : fmt(net)}</td>
                      {cost && <td className="p-2 text-right tabular-nums">{itemCost === null ? (it.sub_sheet_id ? '·' : '—') : brl(Math.round(itemCost))}</td>}
                      {editable && (
                        <td className="p-2">
                          <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Remover o ingrediente ${i + 1}`} onClick={() => setItems((l) => l.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editable && <Button type="button" variant="outline" onClick={() => setItems((l) => [...l, { ingredient_id: null, sub_sheet_id: null, gross: '', fc: '', note: '' }])}><Plus className="size-4" /> Adicionar ingrediente</Button>}
        </section>

        <section aria-labelledby="preparo" className="space-y-3">
          <h2 id="preparo" className="font-display text-xl font-semibold">Modo de preparo</h2>
          {steps.length === 0 && !editable && <p className="text-sm text-muted-foreground">Sem passos registrados.</p>}
          <ol className="space-y-3">
            {steps.map((st, i) => (
              <li key={i} className="space-y-2 rounded-2xl border border-border bg-card p-3">
                {editable ? (
                  <>
                    <Label htmlFor={`st-${i}`}>Passo {i + 1}</Label>
                    <textarea id={`st-${i}`} className={TEXTAREA} maxLength={1000} value={st.text} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={st.critical} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, critical: e.target.checked } : x)))} /> Ponto crítico</label>
                      <div className="w-32 space-y-1.5"><Label htmlFor={`st-t-${i}`}>Temperatura (°C)</Label><Input id={`st-t-${i}`} inputMode="decimal" value={st.target_temp} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, target_temp: e.target.value } : x)))} /></div>
                      <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setSteps((l) => l.filter((_, j) => j !== i))}>Remover passo</Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm">
                    <span className="font-medium">{i + 1}.</span> {st.text}
                    {st.critical && <Badge variant="destructive" className="ml-2">Ponto crítico{st.target_temp ? ` · ${st.target_temp} °C` : ''}</Badge>}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {editable && <Button type="button" variant="outline" onClick={() => setSteps((l) => [...l, { text: '', critical: false, target_temp: '' }])}><Plus className="size-4" /> Adicionar passo</Button>}
        </section>

        {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}
        <div className="flex flex-wrap gap-2">
          {editable && <Button type="button" disabled={pending} onClick={() => save()}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar rascunho</Button>}
          {detail.can_approve && <Button type="button" variant="secondary" disabled={pending} onClick={approve}><CheckCircle2 className="size-4" /> Aprovar ficha</Button>}
          {detail.can_new_version && <Button type="button" disabled={pending} onClick={() => go(() => newSheetVersion(s.id), (id) => `/app/uan/fichas/${id}`)}>Nova versão</Button>}
          {(detail.can_edit || detail.can_new_version) && <Button type="button" variant="outline" disabled={pending} onClick={() => go(() => duplicateSheet(s.id), (id) => `/app/uan/fichas/${id}`)}><Copy className="size-4" /> Duplicar</Button>}
          {editable && (
            <Button type="button" variant="ghost" className="text-destructive" disabled={pending}
              onClick={() => { if (window.confirm('Apagar este rascunho?')) go(async () => { const r = await deleteSheet(s.id); if (r.ok) router.push(`/app/uan/fichas?empresa=${s.organization_id}`); return r; }); }}>
              Apagar rascunho
            </Button>
          )}
        </div>
      </div>

      <aside aria-label="Cálculo da ficha" className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Rendimento</h2>
          {!result ? (
            <p className="text-sm text-muted-foreground">Adicione ingredientes com peso para calcular.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Peso bruto</dt><dd className="text-right tabular-nums">{fmt(result.grossG)} g</dd>
              <dt className="text-muted-foreground">Peso líquido</dt><dd className="text-right tabular-nums">{fmt(result.netG)} g</dd>
              <dt className="text-muted-foreground">Rendimento</dt><dd className="text-right tabular-nums" aria-label="Rendimento">{fmt(result.yieldG)} g</dd>
              <dt className="text-muted-foreground">IC</dt><dd className="text-right tabular-nums">{fmt(result.cookingIndex, 3)}</dd>
              <dt className="text-muted-foreground">Porção</dt><dd className="text-right tabular-nums" aria-label="Porção">{fmt(result.portionG)} g</dd>
              {cost && (
                <>
                  <dt className="text-muted-foreground">Custo total</dt><dd className="text-right tabular-nums" aria-label="Custo total">{brl(result.costCents)}</dd>
                  <dt className="font-medium">Custo por porção</dt><dd className="text-right font-semibold tabular-nums" aria-label="Custo por porção">{brl(result.costPerServingCents)}</dd>
                </>
              )}
            </dl>
          )}
          {result && cost && result.missingPrices.length > 0 && (
            <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> Sem preço (custo mínimo): {result.missingPrices.join(', ')}</p>
          )}
        </div>
        {result && (
          <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="font-semibold">Informação nutricional</h2>
            {result.missingNutrients.length > 0 && (
              <p role="note" className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> Dados incompletos: sem vínculo com a base de alimentos — {result.missingNutrients.join(', ')}</p>
            )}
            {na.length > 0 && (
              <p role="note" className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> Valor não analisado na base (NA) em energia ou macronutrientes: {na.join(', ')}. Escolha outro alimento da base no cadastro do insumo.</p>
            )}
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Nutrientes por porção e por 100 g</caption>
              <thead><tr className="text-muted-foreground"><th className="py-1 text-left font-medium">Nutriente</th><th className="py-1 text-right font-medium">Porção</th><th className="py-1 text-right font-medium">100 g</th></tr></thead>
              <tbody>
                {NUTRIENT_ROWS.filter((r) => result.perServing[r.code] !== undefined).map((r) => (
                  <tr key={r.code} className="border-t border-border">
                    <th scope="row" className="py-1 text-left font-normal">{r.label}</th>
                    <td className="py-1 text-right">{fmt(result.perServing[r.code]!)} {r.unit}</td>
                    <td className="py-1 text-right">{fmt(result.per100g[r.code]!)} {r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Alergênicos</h2>
          {allergens.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum nos insumos cadastrados.</p> : (
            <div className="flex flex-wrap gap-1" aria-label="Alergênicos da ficha">{allergens.map((a) => <Badge key={a} variant="secondary">{ALLERGEN_LABEL[a]}</Badge>)}</div>
          )}
        </div>
      </aside>
    </div>
  );
}
