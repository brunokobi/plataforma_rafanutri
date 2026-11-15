'use client';

import { AlertTriangle, ClipboardList, Loader2, PackageMinus, PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { UNIT_LABEL } from '@/lib/uan/catalog';
import { finishInventory, openInventory, saveCount, stockIn, stockOut } from '@/lib/uan/stock-actions';
import { balances, expiryStatus, MOVE_LABEL, qtyLabel, stockAlerts, toUnits, type InventoryData, type StockData } from '@/lib/uan/stock';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const day = (d: string) => d.split('-').reverse().join('/');
type Msg = { text: string; error?: boolean } | null;
const EXPIRY_CLS = { expired: 'text-destructive font-semibold', soon: 'text-amber-700 dark:text-amber-400 font-semibold', ok: '', none: 'text-muted-foreground' } as const;

function useRun() {
  const router = useRouter();
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; id?: string }>, done: string, then?: (id?: string) => void) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage({ text: r.message ?? 'Não foi possível salvar.', error: true });
      setMessage({ text: done });
      router.refresh();
      then?.(r.id);
    });
  return { message, pending, run };
}

/** Estoque da unidade: alertas, saldo por insumo com lotes, entrada, saída FEFO e movimentos. */
export function StockView({ data }: { data: StockData }) {
  const router = useRouter();
  const rows = useMemo(() => balances(data), [data]);
  const alerts = stockAlerts(rows, data.today);
  const active = data.ingredients.filter((i) => i.active);
  const [inV, setIn] = useState({ ingredient_id: '', quantity: '', lot_code: '', expires_on: '', supplier_id: '', cost: '' });
  const [outV, setOut] = useState({ ingredient_id: '', quantity: '', kind: 'out_production' as 'out_production' | 'out_loss', reason: '' });
  const inRun = useRun();
  const outRun = useRun();
  const invRun = useRun();
  const unitOf = (id: string) => data.ingredients.find((i) => i.id === id);

  return (
    <div className="space-y-8">
      {(alerts.expired > 0 || alerts.soon > 0 || alerts.belowMin > 0) && (
        <ul aria-label="Alertas do estoque" className="flex flex-wrap gap-2 text-sm">
          {alerts.expired > 0 && <li><Badge variant="destructive"><AlertTriangle className="size-3" /> {alerts.expired} lote(s) vencido(s)</Badge></li>}
          {alerts.soon > 0 && <li><Badge variant="secondary"><AlertTriangle className="size-3" /> {alerts.soon} lote(s) vencendo em até 3 dias</Badge></li>}
          {alerts.belowMin > 0 && <li><Badge variant="secondary">{alerts.belowMin} insumo(s) abaixo do mínimo</Badge></li>}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {data.open_inventory ? (
          <Link href={`/app/uan/inventarios/${data.open_inventory.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary underline"><ClipboardList className="size-4" aria-hidden="true" /> Continuar o inventário aberto</Link>
        ) : data.can_move && (
          <Button type="button" variant="outline" disabled={invRun.pending} onClick={() => invRun.run(() => openInventory(data.unit.id), 'Inventário aberto.', (id) => id && router.push(`/app/uan/inventarios/${id}`))}><ClipboardList className="size-4" /> Abrir inventário</Button>
        )}
        {invRun.message && <p role={invRun.message.error ? 'alert' : 'status'} className="text-sm text-destructive">{invRun.message.error ? invRun.message.text : ''}</p>}
      </div>

      <section aria-labelledby="saldo" className="space-y-3">
        <h2 id="saldo" className="font-display text-xl font-semibold">Saldo</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum insumo cadastrado.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[34rem] text-left text-sm tabular-nums">
              <caption className="sr-only">Saldo por insumo</caption>
              <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Insumo</th><th className="p-2 text-right font-medium">Saldo</th><th className="p-2 font-medium">Próxima validade</th><th className="p-2 font-medium">Lotes</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const st = expiryStatus(r.nextExpiry, data.today);
                  return (
                    <tr key={r.ingredient.id} className="border-t border-border align-top">
                      <td className="p-2">
                        {r.ingredient.name}
                        {r.belowMin && <Badge variant="secondary" className="ml-2">Abaixo do mínimo</Badge>}
                      </td>
                      <td className="p-2 text-right" aria-label={`Saldo de ${r.ingredient.name}`}>{qtyLabel(r.quantityG, r.ingredient)}</td>
                      <td className={cn('p-2', EXPIRY_CLS[st])}>{r.nextExpiry ? `${day(r.nextExpiry)}${st === 'expired' ? ' (vencido)' : st === 'soon' ? ' (vence logo)' : ''}` : '—'}</td>
                      <td className="p-2">
                        {r.lots.length === 0 ? '—' : (
                          <details>
                            <summary className="cursor-pointer text-primary">{r.lots.length} lote(s)</summary>
                            <ul className="mt-1 space-y-0.5 text-xs">
                              {r.lots.map((l) => (
                                <li key={l.id} className={EXPIRY_CLS[expiryStatus(l.expires_on, data.today)]}>
                                  {l.lot_code ?? 'sem código'} · {qtyLabel(l.quantity_g, r.ingredient)} · {l.expires_on ? `vence ${day(l.expires_on)}` : 'sem validade'}{l.supplier_name ? ` · ${l.supplier_name}` : ''}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.can_move && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            aria-label="Entrada no estoque"
            className="space-y-3 rounded-2xl border border-border bg-card p-4"
            onSubmit={(e) => { e.preventDefault(); inRun.run(() => stockIn(data.unit.id, inV), 'Entrada registrada.', () => setIn({ ...inV, quantity: '', lot_code: '', expires_on: '', cost: '' })); }}
          >
            <h2 className="flex items-center gap-2 font-semibold"><PackagePlus className="size-4" aria-hidden="true" /> Entrada</h2>
            <div className="space-y-1.5"><Label htmlFor="in-ing">Insumo</Label><select id="in-ing" className={SELECT} value={inV.ingredient_id} onChange={(e) => setIn({ ...inV, ingredient_id: e.target.value })}><option value="">Escolha…</option>{active.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="in-qty">Quantidade ({inV.ingredient_id ? UNIT_LABEL[unitOf(inV.ingredient_id)!.purchase_unit] : 'unidade de compra'})</Label><Input id="in-qty" inputMode="decimal" value={inV.quantity} onChange={(e) => setIn({ ...inV, quantity: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="in-exp">Validade</Label><Input id="in-exp" type="date" value={inV.expires_on} onChange={(e) => setIn({ ...inV, expires_on: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="in-lot">Lote</Label><Input id="in-lot" maxLength={60} value={inV.lot_code} onChange={(e) => setIn({ ...inV, lot_code: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="in-cost">Custo por unidade (R$)</Label><Input id="in-cost" inputMode="decimal" value={inV.cost} onChange={(e) => setIn({ ...inV, cost: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="in-sup">Fornecedor</Label><select id="in-sup" className={SELECT} value={inV.supplier_id} onChange={(e) => setIn({ ...inV, supplier_id: e.target.value })}><option value="">—</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <Button type="submit" disabled={inRun.pending}>{inRun.pending && <Loader2 className="size-4 animate-spin" />} Registrar entrada</Button>
            {inRun.message && <p role={inRun.message.error ? 'alert' : 'status'} className={inRun.message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{inRun.message.text}</p>}
          </form>

          <form
            aria-label="Saída do estoque"
            className="space-y-3 rounded-2xl border border-border bg-card p-4"
            onSubmit={(e) => { e.preventDefault(); outRun.run(() => stockOut(data.unit.id, { kind: outV.kind, reason: outV.reason, lines: [{ ingredient_id: outV.ingredient_id, quantity: outV.quantity }] }), 'Saída registrada (lotes que vencem antes primeiro).', () => setOut({ ...outV, quantity: '', reason: '' })); }}
          >
            <h2 className="flex items-center gap-2 font-semibold"><PackageMinus className="size-4" aria-hidden="true" /> Saída</h2>
            <div className="space-y-1.5"><Label htmlFor="out-ing">Insumo</Label><select id="out-ing" className={SELECT} value={outV.ingredient_id} onChange={(e) => setOut({ ...outV, ingredient_id: e.target.value })}><option value="">Escolha…</option>{rows.filter((r) => r.quantityG > 0).map((r) => <option key={r.ingredient.id} value={r.ingredient.id}>{r.ingredient.name} ({qtyLabel(r.quantityG, r.ingredient)})</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="out-qty">Quantidade ({outV.ingredient_id ? UNIT_LABEL[unitOf(outV.ingredient_id)!.purchase_unit] : 'unidade de compra'})</Label><Input id="out-qty" inputMode="decimal" value={outV.quantity} onChange={(e) => setOut({ ...outV, quantity: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="out-kind">Tipo</Label><select id="out-kind" className={SELECT} value={outV.kind} onChange={(e) => setOut({ ...outV, kind: e.target.value as 'out_production' | 'out_loss' })}><option value="out_production">Produção</option><option value="out_loss">Perda</option></select></div>
            </div>
            {outV.kind === 'out_loss' && <div className="space-y-1.5"><Label htmlFor="out-reason">Motivo da perda</Label><Input id="out-reason" maxLength={300} value={outV.reason} onChange={(e) => setOut({ ...outV, reason: e.target.value })} /></div>}
            <Button type="submit" disabled={outRun.pending}>{outRun.pending && <Loader2 className="size-4 animate-spin" />} Registrar saída</Button>
            {outRun.message && <p role={outRun.message.error ? 'alert' : 'status'} className={outRun.message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{outRun.message.text}</p>}
          </form>
        </div>
      )}

      {data.movements.length > 0 && (
        <section aria-labelledby="movimentos" className="space-y-3">
          <h2 id="movimentos" className="font-display text-xl font-semibold">Movimentos recentes</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
            {data.movements.map((m) => {
              const ing = unitOf(m.ingredient_id);
              return (
                <li key={m.id} className="flex flex-wrap justify-between gap-2 p-2.5">
                  <span>{MOVE_LABEL[m.kind]} · {m.ingredient_name}{m.reason ? ` · ${m.reason}` : ''}<span className="block text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}{m.user_name ? ` · ${m.user_name}` : ''}</span></span>
                  <span className={cn('tabular-nums', m.quantity_g < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400')}>{m.quantity_g > 0 ? '+' : '−'}{ing ? qtyLabel(Math.abs(m.quantity_g), ing) : `${Math.abs(m.quantity_g)} g`}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function CountRow({ inventoryId, c, canApprove }: { inventoryId: string; c: InventoryData['counts'][number]; canApprove: boolean }) {
  const [v, setV] = useState({ counted: c.counted_g === null ? '' : String(toUnits(c.counted_g, c.grams_per_unit) ?? '').replace('.', ','), reason: c.reason ?? '' });
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const save = async () => {
    setState('saving');
    const r = await saveCount(inventoryId, { ingredient_id: c.ingredient_id, counted: v.counted, reason: v.reason });
    setState(r.ok ? 'saved' : 'error');
  };
  const countedG = v.counted.trim() && c.grams_per_unit ? Number(v.counted.replace(',', '.')) * c.grams_per_unit : null;
  const diff = canApprove && c.system_g !== null && countedG !== null ? countedG - c.system_g : null;
  return (
    <tr className="border-t border-border align-top">
      <td className="p-2">{c.name}</td>
      {canApprove && <td className="p-2 text-right tabular-nums">{c.system_g === null ? '—' : qtyLabel(c.system_g, c)}</td>}
      <td className="p-2"><Input aria-label={`Contagem de ${c.name} (${UNIT_LABEL[c.purchase_unit]})`} inputMode="decimal" className="w-28" value={v.counted} onChange={(e) => setV({ ...v, counted: e.target.value })} onBlur={save} /></td>
      {canApprove && <td className={cn('p-2 text-right tabular-nums', diff !== null && Math.abs(diff) > 0.5 && 'font-semibold text-destructive')}>{diff === null ? '—' : `${diff > 0 ? '+' : ''}${qtyLabel(diff, c)}`}</td>}
      <td className="p-2"><Input aria-label={`Motivo de ${c.name}`} className="min-w-40" maxLength={300} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} onBlur={save} /></td>
      <td className="p-2 text-xs text-muted-foreground" aria-live="polite">{state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Salvo' : state === 'error' ? 'Erro ao salvar' : ''}</td>
    </tr>
  );
}

/** Inventário: contagem cega (quem conta não vê o saldo); quem aprova vê o sistema e as divergências. */
export function InventoryView({ data }: { data: InventoryData }) {
  const { message, pending, run } = useRun();
  const open = data.inventory.status === 'open';
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {open ? 'Conte o que há no estoque e digite na unidade de compra; cada linha salva ao sair do campo. Divergências precisam de motivo.' : data.inventory.status === 'approved' ? 'Inventário aprovado: os ajustes foram lançados no estoque.' : 'Inventário cancelado.'}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Contagem do inventário</caption>
          <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Insumo</th>{data.can_approve && <th className="p-2 text-right font-medium">Sistema</th>}<th className="p-2 font-medium">Contado</th>{data.can_approve && <th className="p-2 text-right font-medium">Diferença</th>}<th className="p-2 font-medium">Motivo</th><th className="p-2"><span className="sr-only">Situação</span></th></tr></thead>
          <tbody>{data.counts.map((c) => <CountRow key={c.ingredient_id} inventoryId={data.inventory.id} c={c} canApprove={data.can_approve} />)}</tbody>
        </table>
      </div>
      {open && (
        <div className="flex flex-wrap gap-2">
          {data.can_approve && <Button type="button" disabled={pending} onClick={() => run(() => finishInventory(data.inventory.id, 'approve'), 'Inventário aprovado e ajustes lançados.')}>{pending && <Loader2 className="size-4 animate-spin" />} Aprovar inventário</Button>}
          <Button type="button" variant="ghost" disabled={pending} onClick={() => { if (window.confirm('Cancelar este inventário?')) run(() => finishInventory(data.inventory.id, 'cancel'), 'Inventário cancelado.'); }}>Cancelar inventário</Button>
        </div>
      )}
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}
    </div>
  );
}
