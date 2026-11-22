'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { confirmInvoice, saveBillingSettings, savePlanPrice, voidInvoice } from '@/lib/billing/actions';
import { brl, dateBR, SUB_STATUS_LABEL, type AdminBilling } from '@/lib/billing/types';

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Administração da assinatura: chave Pix, preços, faturas para confirmar e assinaturas. */
export function AdminBillingView({ data }: { data: AdminBilling }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const s = data.settings;
  const [cfg, setCfg] = useState({ pix_key: s?.pix_key ?? '', receiver_name: s?.receiver_name ?? '', receiver_city: s?.receiver_city ?? '', notify_email: s?.notify_email ?? '', grace_days: s?.grace_days ?? 7 });
  const [prices, setPrices] = useState<Record<string, { price: string; sellable: boolean }>>(Object.fromEntries(data.plans.map((p) => [p.code, { price: (p.price_cents / 100).toFixed(2).replace('.', ','), sellable: p.sellable }])));
  const setPrice = (code: string, patch: Partial<{ price: string; sellable: boolean }>) => setPrices((all) => ({ ...all, [code]: { price: patch.price ?? all[code]?.price ?? '', sellable: patch.sellable ?? all[code]?.sellable ?? false } }));
  const run = (fn: () => Promise<{ ok: boolean; message?: string; fields?: Record<string, string> }>, okText: string) => {
    setMsg(null);
    setErrors({});
    startTransition(async () => {
      const r = await fn();
      if (r.ok) { setMsg({ ok: true, text: okText }); router.refresh(); }
      else { setErrors(r.fields ?? {}); setMsg({ ok: false, text: r.message ?? 'Não foi possível.' }); }
    });
  };
  const toConfirm = data.invoices.filter((i) => i.status === 'open');
  const recent = data.invoices.filter((i) => i.status === 'paid');

  return (
    <div className="space-y-6">
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-primary' : 'text-destructive'}`}>{msg.text}</p>}

      <section aria-labelledby="confirmar" className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 id="confirmar" className="font-semibold">Faturas em aberto ({toConfirm.length})</h2>
        <p className="text-sm text-muted-foreground">Confira no extrato (valor e nome do pagador) e confirme. As marcadas &quot;Pix informado&quot; vêm primeiro.</p>
        {toConfirm.length === 0 ? <p className="text-sm text-muted-foreground">Nada para confirmar.</p> : (
          <ul className="divide-y divide-border text-sm">
            {toConfirm.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{i.organization_name} · {brl(i.amount_cents)} {i.reported_paid_at && <Badge className="ml-1">Pix informado {when(i.reported_paid_at)}</Badge>}</p>
                  <p className="text-xs text-muted-foreground">{i.owner_email ?? '—'} · plano {i.plan} · vence {dateBR(i.due_on)} · {dateBR(i.period_start)} a {dateBR(i.period_end)} · id {i.txid}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => window.confirm(`Confirmar o pagamento de ${brl(i.amount_cents)} de ${i.organization_name}? O plano é liberado na hora.`) && run(() => confirmInvoice(i.id), 'Pagamento confirmado e plano liberado.')}>Confirmar pagamento</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => window.confirm('Cancelar esta fatura?') && run(() => voidInvoice(i.id), 'Fatura cancelada.')}>Cancelar</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {recent.length > 0 && <p className="text-xs text-muted-foreground">Confirmadas nos últimos 30 dias: {recent.map((i) => `${i.organization_name} (${brl(i.amount_cents)})`).join(', ')}.</p>}
      </section>

      <section aria-labelledby="pix" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 id="pix" className="font-semibold">Recebimento por Pix</h2>
        <p className="text-sm text-muted-foreground">Chave e dados que vão no QR code das faturas. Sem isso, ninguém consegue assinar.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ['pix_key', 'Chave Pix (CNPJ, CPF, e-mail, celular ou aleatória)'],
            ['receiver_name', 'Nome do recebedor (como no banco, até 25 letras)'],
            ['receiver_city', 'Cidade do recebedor'],
            ['notify_email', 'E-mail que recebe os avisos de Pix informado (opcional)'],
          ] as const).map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={k}>{label}</Label>
              <Input id={k} value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} aria-invalid={Boolean(errors[k])} />
              {errors[k] && <p className="text-sm text-destructive">{errors[k]}</p>}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="grace_days">Carência depois do vencimento (dias)</Label>
            <Input id="grace_days" type="number" min={0} max={30} value={cfg.grace_days} onChange={(e) => setCfg({ ...cfg, grace_days: Number(e.target.value) })} />
            {errors.grace_days && <p className="text-sm text-destructive">{errors.grace_days}</p>}
          </div>
        </div>
        <Button disabled={pending} onClick={() => run(() => saveBillingSettings(cfg), 'Recebimento salvo.')}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar recebimento</Button>
      </section>

      <section aria-labelledby="precos" className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 id="precos" className="font-semibold">Planos e preços</h2>
        <p className="text-sm text-muted-foreground">Preço mensal. Só aparece para assinar o plano marcado &quot;à venda&quot; com preço. Mudança de preço vale para as próximas faturas.</p>
        <ul className="divide-y divide-border">
          {data.plans.map((p) => (
            <li key={p.code} className="flex flex-wrap items-end gap-3 py-3">
              <span className="w-28 font-medium">{p.name}</span>
              <div className="space-y-1">
                <Label htmlFor={`price-${p.code}`} className="text-xs">Preço (R$)</Label>
                <Input id={`price-${p.code}`} className="w-32" inputMode="decimal" value={prices[p.code]?.price ?? ''} onChange={(e) => setPrice(p.code, { price: e.target.value })} />
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={prices[p.code]?.sellable ?? false} onChange={(e) => setPrice(p.code, { sellable: e.target.checked })} /> À venda
              </label>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => savePlanPrice(p.code, prices[p.code]?.price ?? '', prices[p.code]?.sellable ?? false), `Plano ${p.name} salvo.`)}>Salvar</Button>
              <span className="text-xs text-muted-foreground">Anual: {p.annual_price_cents ? brl(p.annual_price_cents) : '—'} (12 meses com 50% de desconto, recalculado ao salvar)</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="assinaturas" className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 id="assinaturas" className="font-semibold">Assinaturas ({data.subscriptions.length})</h2>
        {data.subscriptions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma assinatura ainda.</p> : (
          <ul className="divide-y divide-border text-sm">
            {data.subscriptions.map((x) => (
              <li key={x.organization_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{x.organization_name} · plano {x.plan}{x.next_plan ? ` → ${x.next_plan}` : ''}</span>
                <span className="text-muted-foreground">{SUB_STATUS_LABEL[x.status]}{x.current_period_end ? ` até ${dateBR(x.current_period_end)}` : ''}{x.cancel_at_period_end ? ' (cancela no fim)' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
