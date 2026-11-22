'use client';

import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveTemplate } from '@/lib/uan/checklist-actions';
import { CATEGORY_LABEL, FREQUENCY_LABEL, validateTemplateItems, type ChecklistCategory, type Frequency, type TemplateDetail, type TemplateItemInput } from '@/lib/uan/checklists';
import { toInputDecimal as txt } from '@/lib/format/number';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const blank = (section: string): TemplateItemInput => ({ section, prompt: '', help: '', kind: 'compliance', unit: '', min_value: '', max_value: '', critical: false });

/** Editor de modelo da empresa: dados gerais e itens (adicionar, mover, apagar, crítico, valor medido). */
export function TemplateEditor({ detail }: { detail: TemplateDetail }) {
  const router = useRouter();
  const t = detail.template;
  const [meta, setMeta] = useState({ name: t.name, description: t.description ?? '', category: t.category, frequency_hint: t.frequency_hint, active: t.active });
  const [items, setItems] = useState<TemplateItemInput[]>(() =>
    detail.items.map((i) => ({ section: i.section ?? '', prompt: i.prompt, help: i.help ?? '', kind: i.kind, unit: i.unit ?? '', min_value: txt(i.min_value), max_value: txt(i.max_value), critical: i.critical })),
  );
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (i: number, p: Partial<TemplateItemInput>) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setItems((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const save = () => {
    setMessage(null);
    const problem = meta.name.trim().length < 2 ? 'Informe o nome do modelo.' : validateTemplateItems(items);
    if (problem) return setMessage({ text: problem, error: true });
    startTransition(async () => {
      const r = await saveTemplate(t.id, { ...meta, items });
      if (!r.ok) return setMessage({ text: r.message, error: true });
      setMessage({ text: 'Modelo salvo. Os próximos checklists já usam esta versão.' });
      router.refresh();
    });
  };

  return (
    <form
      aria-label="Editar modelo"
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tp-name">Nome do modelo</Label>
          <Input id="tp-name" maxLength={120} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="tp-desc">Descrição (opcional)</Label>
          <Input id="tp-desc" maxLength={500} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tp-cat">Categoria</Label>
          <select id="tp-cat" className={SELECT} value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value as ChecklistCategory })}>
            {(Object.keys(CATEGORY_LABEL) as ChecklistCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tp-freq">Frequência sugerida</Label>
          <select id="tp-freq" className={SELECT} value={meta.frequency_hint} onChange={(e) => setMeta({ ...meta, frequency_hint: e.target.value as Frequency })}>
            {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4" checked={meta.active} onChange={(e) => setMeta({ ...meta, active: e.target.checked })} /> Modelo em uso (aparece para a equipe)
        </label>
      </div>

      <ol aria-label="Itens do modelo" className="space-y-3">
        {items.map((it, i) => (
          <li key={i} className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Item {i + 1}</span>
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label={`Subir o item ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Descer o item ${i + 1}`} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
                <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`Apagar o item ${i + 1}`} disabled={items.length === 1} onClick={() => setItems((l) => l.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor={`it-sec-${i}`}>Seção</Label>
                <Input id={`it-sec-${i}`} maxLength={120} value={it.section} onChange={(e) => patch(i, { section: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`it-prompt-${i}`}>Pergunta do item {i + 1}</Label>
                <Input id={`it-prompt-${i}`} maxLength={500} value={it.prompt} onChange={(e) => patch(i, { prompt: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`it-kind-${i}`}>Resposta</Label>
                <select id={`it-kind-${i}`} className={SELECT} value={it.kind} onChange={(e) => patch(i, { kind: e.target.value as TemplateItemInput['kind'], unit: e.target.value === 'number' ? it.unit || '°C' : '' })}>
                  <option value="compliance">Conforme / não conforme</option>
                  <option value="number">Valor medido</option>
                </select>
              </div>
              {it.kind === 'number' && (
                <>
                  <div className="w-20 space-y-1.5"><Label htmlFor={`it-unit-${i}`}>Unidade</Label><Input id={`it-unit-${i}`} maxLength={10} value={it.unit} onChange={(e) => patch(i, { unit: e.target.value })} /></div>
                  <div className="w-24 space-y-1.5"><Label htmlFor={`it-min-${i}`}>Mínimo</Label><Input id={`it-min-${i}`} value={it.min_value} onChange={(e) => patch(i, { min_value: e.target.value })} /></div>
                  <div className="w-24 space-y-1.5"><Label htmlFor={`it-max-${i}`}>Máximo</Label><Input id={`it-max-${i}`} value={it.max_value} onChange={(e) => patch(i, { max_value: e.target.value })} /></div>
                </>
              )}
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={it.critical} onChange={(e) => patch(i, { critical: e.target.checked })} /> Crítico (exige foto e abre não conformidade)
              </label>
            </div>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" onClick={() => setItems((l) => [...l, blank(l[l.length - 1]?.section ?? '')])}><Plus className="size-4" /> Adicionar item</Button>

      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}
      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar modelo</Button>
      </div>
    </form>
  );
}
