'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveSheetAdjustment, type SheetAdjustments } from '@/lib/uan/adjustment-actions';

/** RN-221 — Ajuste local de per capita: fator sobre as quantidades da ficha da rede, só nesta unidade. */
export function SheetAdjustmentsView({ unitId, data }: { unitId: string; data: SheetAdjustments }) {
  const router = useRouter();
  const [v, setV] = useState({ sheet_root_id: '', portion_factor: '', notes: '' });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const save = (body: { sheet_root_id: string; portion_factor: string | null; notes?: string }, done: string) =>
    startTransition(async () => {
      setMsg(null);
      const r = await saveSheetAdjustment(unitId, body);
      if (!r.ok) return setMsg({ text: r.message, error: true });
      setMsg({ text: done });
      setV({ sheet_root_id: '', portion_factor: '', notes: '' });
      router.refresh();
    });
  if (!data.can_edit && data.adjustments.length === 0) return null;
  return (
    <section aria-labelledby="per-capita" className="space-y-3">
      <h2 id="per-capita" className="font-display text-xl font-semibold">Ajuste local de per capita</h2>
      <p className="text-sm text-muted-foreground">Muda as quantidades da ficha da rede só nesta unidade (1,2 = 20% a mais). A ficha não muda; a produção, a requisição, as compras e os custos usam o fator.</p>
      {data.adjustments.length > 0 && (
        <ul aria-label="Ajustes de per capita" className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
          {data.adjustments.map((a) => (
            <li key={a.sheet_root_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>{a.name} · <strong>× {a.portion_factor.toLocaleString('pt-BR')}</strong>{a.notes ? <span className="text-muted-foreground"> · {a.notes}</span> : null}</span>
              {data.can_edit && <Button type="button" size="sm" variant="ghost" aria-label={`Remover ajuste de ${a.name}`} disabled={pending} onClick={() => save({ sheet_root_id: a.sheet_root_id, portion_factor: null }, 'Ajuste removido.')}><Trash2 className="size-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
      {data.can_edit && (
        <form aria-label="Novo ajuste de per capita" className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); save(v, 'Ajuste salvo.'); }}>
          <div className="space-y-1.5"><Label htmlFor="adj-sheet">Ficha</Label>
            <select id="adj-sheet" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={v.sheet_root_id} onChange={(e) => setV({ ...v, sheet_root_id: e.target.value })}>
              <option value="">—</option>{data.sheets.map((s) => <option key={s.root_id} value={s.root_id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="adj-factor">Fator</Label><Input id="adj-factor" inputMode="decimal" placeholder="1,2" value={v.portion_factor} onChange={(e) => setV({ ...v, portion_factor: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="adj-notes">Motivo (opcional)</Label><Input id="adj-notes" maxLength={500} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
          <Button type="submit" disabled={pending || !v.sheet_root_id || !v.portion_factor}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </form>
      )}
      {msg && <p role={msg.error ? 'alert' : 'status'} className={msg.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{msg.text}</p>}
    </section>
  );
}
