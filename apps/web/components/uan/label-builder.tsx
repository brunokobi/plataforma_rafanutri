'use client';

import { Archive, Download, Loader2, Tag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { allergenStatement, type PhysicalState } from '@rafanutri/nutrition-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { archiveLabel, issueLabel } from '@/lib/uan/label-actions';
import { buildLabel, labelPer100, labelSvg, type LabelLayout, type LabelRecord, type SheetLabels } from '@/lib/uan/labels';
import { buildInputs, calculate, sheetAllergens, type SheetDetail } from '@/lib/uan/techsheets';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';
const parse = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadSvg(l: LabelRecord) {
  download(`rotulo-${slug(l.product_name)}.svg`, new Blob([labelSvg(l)], { type: 'image/svg+xml' }));
}
function downloadPng(l: LabelRecord) {
  const svg = labelSvg(l);
  const img = new Image();
  img.onload = () => {
    const scale = 4;
    const c = document.createElement('canvas');
    c.width = img.width * scale;
    c.height = img.height * scale;
    const ctx = c.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    c.toBlob((b) => b && download(`rotulo-${slug(l.product_name)}.png`, b), 'image/png');
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** RN-162 a RN-164 — Rótulo nutricional da ficha aprovada: tabela, lupa e alergênicos; emissão e download. */
export function LabelBuilder({ detail, labels }: { detail: SheetDetail; labels: SheetLabels }) {
  const router = useRouter();
  const s = detail.sheet;
  const ingredients = detail.graph.ingredients;
  const result = useMemo(() => calculate(s.id, buildInputs(s.id, detail.graph, ingredients)), [s.id, detail.graph, ingredients]);
  const allergens = useMemo(() => sheetAllergens(s.id, detail.graph, ingredients), [s.id, detail.graph, ingredients]);
  const [v, setV] = useState({
    product_name: s.name, state: (s.category === 'beverage' ? 'liquid' : 'solid') as PhysicalState,
    portion: result ? String(Math.round(result.portionG)) : '', measure: '', per_pack: '', total_sugar: '', trans: '0',
    statement: allergenStatement(allergens), layout: 'vertical' as LabelLayout,
  });
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const portion = parse(v.portion) ?? 0;
  const per100 = result ? labelPer100(result.per100g, { total_sugar_g: parse(v.total_sugar), trans_fat_g: parse(v.trans) }) : null;
  const built = per100 && portion > 0 ? buildLabel(per100, portion, v.state) : null;
  const missingFood = result?.missingNutrients ?? [];
  const preview = built
    ? labelSvg({ product_name: v.product_name, physical_state: v.state, portion_g: portion, household_measure: v.measure || '—', servings_per_pack: parse(v.per_pack), values: built.values, front_warnings: built.warnings, allergen_statement: v.statement.trim() || null, layout: v.layout })
    : null;

  return (
    <section aria-labelledby="rotulo" className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <h2 id="rotulo" className="flex items-center gap-2 font-display text-xl font-semibold"><Tag className="size-5" aria-hidden="true" /> Rótulo nutricional</h2>
      {!result ? <p className="text-sm text-muted-foreground">Não foi possível calcular a ficha.</p> : (
        <>
          {missingFood.length > 0 && <p role="note" className="text-sm text-amber-700 dark:text-amber-400">Sem vínculo com a base de alimentos: {missingFood.join(', ')}. Os valores ficam abaixo do real; vincule os insumos antes de emitir.</p>}
          {labels.can_issue && (
            <div className="grid gap-6 lg:grid-cols-2">
              <form aria-label="Dados do rótulo" className="grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!built || built.problems.length) return;
                  startTransition(async () => {
                    setMessage(null);
                    const r = await issueLabel(s.id, {
                      product_name: v.product_name, physical_state: v.state, portion_g: portion, household_measure: v.measure, servings_per_pack: parse(v.per_pack),
                      values: built.values, front_warnings: built.warnings, allergens, allergen_statement: v.statement.trim() || null, layout: v.layout,
                    });
                    if (!r.ok) return setMessage({ text: r.message, error: true });
                    setMessage({ text: 'Rótulo emitido.' });
                    router.refresh();
                  });
                }}>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="lb-name">Nome do produto</Label><Input id="lb-name" maxLength={120} value={v.product_name} onChange={(e) => setV({ ...v, product_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="lb-state">Estado físico</Label>
                  <select id="lb-state" className={SELECT} value={v.state} onChange={(e) => setV({ ...v, state: e.target.value as PhysicalState })}><option value="solid">Sólido (g)</option><option value="liquid">Líquido (mL)</option></select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="lb-portion">Porção ({v.state === 'liquid' ? 'mL' : 'g'})</Label><Input id="lb-portion" inputMode="decimal" value={v.portion} onChange={(e) => setV({ ...v, portion: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="lb-measure">Medida caseira</Label><Input id="lb-measure" maxLength={60} placeholder="1 fatia, 1 xícara…" value={v.measure} onChange={(e) => setV({ ...v, measure: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="lb-layout">Formato</Label>
                  <select id="lb-layout" className={SELECT} value={v.layout} onChange={(e) => setV({ ...v, layout: e.target.value as LabelLayout })}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option><option value="linear">Linear</option></select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="lb-pack">Porções por embalagem (opcional)</Label><Input id="lb-pack" inputMode="decimal" value={v.per_pack} onChange={(e) => setV({ ...v, per_pack: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="lb-sugar">Açúcares totais (g por 100 {v.state === 'liquid' ? 'mL' : 'g'})</Label><Input id="lb-sugar" inputMode="decimal" value={v.total_sugar} onChange={(e) => setV({ ...v, total_sugar: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="lb-trans">Gorduras trans (g por 100 {v.state === 'liquid' ? 'mL' : 'g'})</Label><Input id="lb-trans" inputMode="decimal" value={v.trans} onChange={(e) => setV({ ...v, trans: e.target.value })} /></div>
                <p className="text-xs text-muted-foreground sm:col-span-2">A TACO não tem açúcares totais nem gorduras trans: informe pelo laudo ou pela tabela dos ingredientes. Açúcares adicionados vêm do cadastro dos insumos ({(per100?.added_sugar_g ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g por 100 g).</p>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="lb-allergens">Declaração de alergênicos</Label>
                  <textarea id="lb-allergens" className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs" maxLength={1000} value={v.statement} onChange={(e) => setV({ ...v, statement: e.target.value })} />
                </div>
                {built?.problems.map((p) => <p key={p} className="text-sm text-destructive sm:col-span-2">{p}</p>)}
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={pending || !built || built.problems.length > 0 || v.measure.trim().length < 2}>{pending && <Loader2 className="size-4 animate-spin" />} Emitir rótulo</Button>
                </div>
                {message && <p role={message.error ? 'alert' : 'status'} className={`text-sm sm:col-span-2 ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>{message.text}</p>}
                <p className="text-xs text-muted-foreground sm:col-span-2">Cálculo pela IN 75/2020 (valores de referência, arredondamento e limites da lupa a validar com a RT). A responsabilidade pelo rótulo é do responsável técnico.</p>
              </form>
              <div>
                <p className="mb-2 text-sm font-medium">Pré-visualização</p>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- SVG gerado no aparelho
                  <img alt="Pré-visualização do rótulo nutricional" className="max-w-full rounded-lg border border-border bg-white" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`} />
                ) : <p className="text-sm text-muted-foreground">Informe a porção.</p>}
              </div>
            </div>
          )}
        </>
      )}
      {labels.labels.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Rótulos emitidos</h3>
          <ul aria-label="Rótulos emitidos" className="divide-y divide-border rounded-xl border border-border text-sm">
            {labels.labels.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                <span>{l.product_name} · {l.portion_g.toLocaleString('pt-BR')} {l.physical_state === 'liquid' ? 'mL' : 'g'} ({l.household_measure}) · ficha v{l.sheet_version} · {new Date(l.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{l.front_warnings.length ? ' · lupa' : ''}</span>
                <span className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => downloadSvg(l)}><Download className="size-4" /> SVG</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => downloadPng(l)}><Download className="size-4" /> PNG</Button>
                  <Button asChild size="sm" variant="outline"><a href={`/app/uan/rotulos/${l.id}/pdf`}><Download className="size-4" /> PDF</a></Button>
                  {labels.can_issue && (
                    <Button type="button" size="sm" variant="ghost" aria-label={`Arquivar rótulo de ${new Date(l.created_at).toLocaleDateString('pt-BR')}`} disabled={pending}
                      onClick={() => startTransition(async () => { const r = await archiveLabel(s.id, l.id); if (!r.ok) setMessage({ text: r.message, error: true }); router.refresh(); })}>
                      <Archive className="size-4" />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
