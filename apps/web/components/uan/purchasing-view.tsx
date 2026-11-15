'use client';

import { AlertTriangle, Loader2, Plus, Send, ShoppingCart, Trash2, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { brl, UNIT_LABEL } from '@/lib/uan/catalog';
import { createOrders, orderAction, receiveOrder, saveOrder } from '@/lib/uan/purchasing-actions';
import { computeNeeds, draftOrders, PO_STATUS_LABEL, receivingLimit, temperatureRejects, type NeedsData, type PoDetail, type PoListItem } from '@/lib/uan/purchasing';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const kg = (g: number) => `${(g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
const unitLabel = (u: string) => UNIT_LABEL[u as keyof typeof UNIT_LABEL] ?? u;
const day = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
type Msg = { text: string; error?: boolean } | null;

/** Necessidade de compra do período e lista de pedidos da unidade. */
export function PurchasingView({ needs, orders }: { needs: NeedsData; orders: PoListItem[] }) {
  const router = useRouter();
  const [margin, setMargin] = useState('5');
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const lines = useMemo(() => computeNeeds(needs, Number(margin.replace(',', '.')) || 0), [needs, margin]);
  const drafts = draftOrders(lines);
  const missingDiners = needs.days.some((d) => d.items.length > 0 && d.items.some((i) => !needs.diners.find((x) => x.day === d.day && x.service === i.service)?.planned));

  return (
    <div className="space-y-8">
      <section aria-labelledby="necessidade" className="space-y-3">
        <h2 id="necessidade" className="font-display text-xl font-semibold">Necessidade de compra</h2>
        <form className="flex flex-wrap items-end gap-3" action={`/app/uan/unidades/${needs.unit.id}/compras`}>
          <div className="space-y-1"><Label htmlFor="pn-from" className="text-xs">De</Label><Input id="pn-from" name="de" type="date" defaultValue={needs.from} className="w-40" /></div>
          <div className="space-y-1"><Label htmlFor="pn-to" className="text-xs">Até</Label><Input id="pn-to" name="ate" type="date" defaultValue={needs.to} className="w-40" /></div>
          <Button type="submit" variant="outline">Calcular</Button>
          <div className="w-28 space-y-1"><Label htmlFor="pn-margin" className="text-xs">Margem (%)</Label><Input id="pn-margin" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} /></div>
        </form>
        {missingDiners && <p className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400"><AlertTriangle className="size-4" aria-hidden="true" /> Há dias com cardápio e sem comensais previstos: eles não entram na conta.</p>}
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma necessidade no período (sem cardápio aprovado ou sem comensais previstos).</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[40rem] text-left text-sm tabular-nums">
              <caption className="sr-only">Necessidade de compra por insumo</caption>
              <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Insumo</th><th className="p-2 text-right font-medium">Necessidade</th><th className="p-2 text-right font-medium">Estoque</th><th className="p-2 text-right font-medium">Pedidos abertos</th><th className="p-2 text-right font-medium">Comprar</th><th className="p-2 font-medium">Fornecedor</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className={cn('border-t border-border', l.toBuyG === 0 && 'text-muted-foreground')}>
                    <td className="p-2">{l.name}</td>
                    <td className="p-2 text-right">{kg(l.needG)}</td>
                    <td className="p-2 text-right">{kg(l.stockG)}</td>
                    <td className="p-2 text-right">{l.openOrdersG ? kg(l.openOrdersG) : '—'}</td>
                    <td className="p-2 text-right font-medium" aria-label={`Comprar ${l.name}`}>{l.toBuyUnits === null ? kg(l.toBuyG) : l.toBuyUnits ? `${l.toBuyUnits.toLocaleString('pt-BR')} ${unitLabel(l.purchaseUnit)}` : '—'}</td>
                    <td className="p-2">{l.supplierName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {drafts.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={pending}
              onClick={() => startTransition(async () => {
                setMessage(null);
                const r = await createOrders(needs.unit.id, drafts.map((d) => ({ supplier_id: d.supplier_id, items: d.items })));
                if (!r.ok) return setMessage({ text: r.message, error: true });
                setMessage({ text: `${r.ids?.length ?? 0} pedido(s) criado(s) em rascunho.` });
                router.refresh();
              })}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />} Gerar {drafts.length} pedido(s) em rascunho
            </Button>
            <span className="text-xs text-muted-foreground">Um por fornecedor do último preço: {drafts.map((d) => d.supplierName).join(', ')}</span>
          </div>
        )}
        {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}
      </section>

      <section aria-labelledby="pedidos" className="space-y-3">
        <h2 id="pedidos" className="font-display text-xl font-semibold">Pedidos</h2>
        {orders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p> : (
          <ul aria-label="Pedidos de compra" className="divide-y divide-border rounded-2xl border border-border bg-card">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <Link href={`/app/uan/pedidos/${o.id}`} className="font-medium hover:underline">{o.supplier_name ?? 'Sem fornecedor'}</Link>
                  <span className="block text-xs text-muted-foreground">{o.item_count} item(ns) · {brl(o.total_cents)} · criado em {new Date(o.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{o.expected_on ? ` · entrega ${day(o.expected_on)}` : ''}</span>
                </span>
                <Badge variant={o.status === 'received' ? 'default' : o.status === 'cancelled' ? 'outline' : 'secondary'}>{PO_STATUS_LABEL[o.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Pedido: edição no rascunho, envio, recebimento com conferência e histórico de recebimentos. */
export function OrderView({ detail }: { detail: PoDetail }) {
  const router = useRouter();
  const o = detail.order;
  const [meta, setMeta] = useState({ supplier_id: o.supplier_id ?? '', expected_on: o.expected_on ?? '', notes: o.notes ?? '' });
  const [items, setItems] = useState(detail.items.map((i) => ({ ingredient_id: i.ingredient_id, quantity_units: String(i.quantity_units).replace('.', ','), unit_price: i.unit_price_cents === null ? '' : String(i.unit_price_cents / 100).replace('.', ',') })));
  const [rec, setRec] = useState(detail.items.map((i) => ({ ingredient_id: i.ingredient_id, quantity_units: String(i.quantity_units - i.received_units).replace('.', ','), accepted: true, lot_code: '', expires_on: '', temperature: '', unit_price: i.unit_price_cents === null ? '' : String(i.unit_price_cents / 100).replace('.', ','), reject_reason: '' })));
  const [invoice, setInvoice] = useState('');
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const name = (id: string) => detail.items.find((i) => i.ingredient_id === id)?.name ?? detail.catalog.find((c) => c.id === id)?.name ?? 'Insumo';
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage({ text: r.message ?? 'Não foi possível concluir.', error: true });
      setMessage({ text: done });
      router.refresh();
    });
  const total = items.reduce((s, i) => s + (Number(i.quantity_units.replace(',', '.')) || 0) * (Number(i.unit_price.replace(',', '.')) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={o.status === 'received' ? 'default' : 'secondary'}>{PO_STATUS_LABEL[o.status]}</Badge>
        {detail.supplier && <span className="text-sm text-muted-foreground">{[detail.supplier.phone, detail.supplier.email].filter(Boolean).join(' · ')}</span>}
      </div>

      {o.status === 'draft' ? (
        <form aria-label="Itens do pedido" className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveOrder(o.id, { ...meta, items }), 'Pedido salvo.'); }}>
          <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="po-sup">Fornecedor</Label><select id="po-sup" className={SELECT} value={meta.supplier_id} onChange={(e) => setMeta({ ...meta, supplier_id: e.target.value })}><option value="">Sem fornecedor</option>{detail.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="po-exp">Entrega prevista</Label><Input id="po-exp" type="date" value={meta.expected_on} onChange={(e) => setMeta({ ...meta, expected_on: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="po-notes">Observações</Label><Input id="po-notes" maxLength={1000} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">Itens</caption>
              <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Insumo</th><th className="w-28 p-2 font-medium">Quantidade</th><th className="w-28 p-2 font-medium">Preço (R$)</th><th className="w-10 p-2"><span className="sr-only">Remover</span></th></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">
                      {detail.items.some((x) => x.ingredient_id === it.ingredient_id) ? name(it.ingredient_id) : (
                        <select aria-label={`Insumo ${i + 1}`} className={SELECT} value={it.ingredient_id} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ingredient_id: e.target.value } : x)))}>
                          <option value="">Escolha…</option>{detail.catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({unitLabel(c.purchase_unit)})</option>)}
                        </select>
                      )}
                    </td>
                    <td className="p-2"><Input aria-label={`Quantidade de ${name(it.ingredient_id)}`} inputMode="decimal" value={it.quantity_units} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, quantity_units: e.target.value } : x)))} /></td>
                    <td className="p-2"><Input aria-label={`Preço de ${name(it.ingredient_id)}`} inputMode="decimal" value={it.unit_price} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, unit_price: e.target.value } : x)))} /></td>
                    <td className="p-2"><Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Remover ${name(it.ingredient_id)}`} onClick={() => setItems((l) => l.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm">Total estimado: <span className="font-semibold tabular-nums">{brl(Math.round(total * 100))}</span></p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setItems((l) => [...l, { ingredient_id: '', quantity_units: '', unit_price: '' }])}><Plus className="size-4" /> Adicionar item</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar pedido</Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(async () => { const s = await saveOrder(o.id, { ...meta, items }); return s.ok ? orderAction(o.id, 'send') : s; }, 'Pedido enviado ao fornecedor.')}><Send className="size-4" /> Marcar como enviado</Button>
            <Button type="button" variant="ghost" className="text-destructive" disabled={pending} onClick={() => { if (window.confirm('Cancelar este pedido?')) run(() => orderAction(o.id, 'cancel'), 'Pedido cancelado.'); }}>Cancelar pedido</Button>
          </div>
        </form>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[32rem] text-left text-sm tabular-nums">
            <caption className="sr-only">Itens do pedido</caption>
            <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Insumo</th><th className="p-2 text-right font-medium">Pedido</th><th className="p-2 text-right font-medium">Recebido</th><th className="p-2 text-right font-medium">Preço</th></tr></thead>
            <tbody>{detail.items.map((i) => <tr key={i.ingredient_id} className="border-t border-border"><td className="p-2">{i.name}</td><td className="p-2 text-right">{i.quantity_units.toLocaleString('pt-BR')} {unitLabel(i.purchase_unit)}</td><td className="p-2 text-right">{i.received_units.toLocaleString('pt-BR')}</td><td className="p-2 text-right">{i.unit_price_cents === null ? '—' : brl(i.unit_price_cents)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {o.status === 'sent' && (
        <form aria-label="Recebimento" className="space-y-3 rounded-2xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const bad = rec.find((r) => !r.accepted && !r.reject_reason.trim());
            if (bad) return setMessage({ text: `Informe o motivo da recusa de ${name(bad.ingredient_id)}.`, error: true });
            run(() => receiveOrder(o.id, { invoice_number: invoice, notes: '', items: rec }), 'Recebimento registrado: aceitos no estoque, recusados viraram não conformidade.');
          }}>
          <h2 className="flex items-center gap-2 font-semibold"><Truck className="size-4" aria-hidden="true" /> Recebimento</h2>
          <div className="w-48 space-y-1.5"><Label htmlFor="rc-nf">Nota fiscal</Label><Input id="rc-nf" maxLength={60} value={invoice} onChange={(e) => setInvoice(e.target.value)} /></div>
          {rec.map((r, i) => {
            const item = detail.items.find((x) => x.ingredient_id === r.ingredient_id)!;
            const temp = r.temperature.trim() ? Number(r.temperature.replace(',', '.').replace('−', '-')) : null;
            const limit = receivingLimit(item.storage);
            const set = (p: Partial<typeof r>) => setRec((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <fieldset key={r.ingredient_id} aria-label={`Conferência de ${item.name}`} className="grid gap-2 border-t border-border pt-3 sm:grid-cols-6 sm:items-end">
                <legend className="text-sm font-medium sm:col-span-6">{item.name}{limit !== null ? ` · chegar até ${limit} °C` : ''}</legend>
                <div className="space-y-1"><Label htmlFor={`rc-q-${i}`} className="text-xs">Quantidade ({unitLabel(item.purchase_unit)})</Label><Input id={`rc-q-${i}`} inputMode="decimal" value={r.quantity_units} onChange={(e) => set({ quantity_units: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor={`rc-t-${i}`} className="text-xs">Temperatura (°C)</Label><Input id={`rc-t-${i}`} inputMode="text" value={r.temperature}
                  onChange={(e) => { const v = e.target.value; const t = v.trim() ? Number(v.replace(',', '.').replace('−', '-')) : null; set({ temperature: v, ...(temperatureRejects(item.storage, Number.isFinite(t) ? t : null) ? { accepted: false } : {}) }); }} /></div>
                <div className="space-y-1"><Label htmlFor={`rc-l-${i}`} className="text-xs">Lote</Label><Input id={`rc-l-${i}`} maxLength={60} value={r.lot_code} onChange={(e) => set({ lot_code: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor={`rc-v-${i}`} className="text-xs">Validade</Label><Input id={`rc-v-${i}`} type="date" value={r.expires_on} onChange={(e) => set({ expires_on: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor={`rc-p-${i}`} className="text-xs">Preço pago (R$)</Label><Input id={`rc-p-${i}`} inputMode="decimal" value={r.unit_price} onChange={(e) => set({ unit_price: e.target.value })} /></div>
                <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={r.accepted} onChange={(e) => set({ accepted: e.target.checked })} /> Aceito</label>
                {!r.accepted && (
                  <div className="space-y-1 sm:col-span-6">
                    <Label htmlFor={`rc-r-${i}`} className="text-xs">Motivo da recusa (abre não conformidade)</Label>
                    <Input id={`rc-r-${i}`} maxLength={500} value={r.reject_reason} onChange={(e) => set({ reject_reason: e.target.value })} />
                    {temperatureRejects(item.storage, temp) && <p className="text-xs text-destructive">Temperatura acima do limite de {limit} °C.</p>}
                  </div>
                )}
              </fieldset>
            );
          })}
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Registrar recebimento</Button>
        </form>
      )}
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}

      {detail.receipts.length > 0 && (
        <section aria-labelledby="recebimentos" className="space-y-2">
          <h2 id="recebimentos" className="font-semibold">Recebimentos</h2>
          {detail.receipts.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-3 text-sm">
              <p className="text-muted-foreground">{new Date(r.received_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{r.received_by_name ? ` · ${r.received_by_name}` : ''}{r.invoice_number ? ` · NF ${r.invoice_number}` : ''}</p>
              <ul className="mt-1 space-y-0.5">
                {r.items.map((i) => (
                  <li key={i.ingredient_id}>
                    {name(i.ingredient_id)}: {i.accepted ? `aceito, ${i.quantity_units.toLocaleString('pt-BR')}` : <span className="text-destructive">recusado — {i.reject_reason}</span>}
                    {i.temperature !== null && ` · ${i.temperature.toLocaleString('pt-BR')} °C`}{i.lot_code ? ` · lote ${i.lot_code}` : ''}{i.expires_on ? ` · vence ${day(i.expires_on)}` : ''}
                    {i.non_conformity_id && <> · <Link href={`/app/uan/nao-conformidades/${i.non_conformity_id}`} className="underline">não conformidade</Link></>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
