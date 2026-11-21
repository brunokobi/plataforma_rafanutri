'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cancelSubscription, resumeSubscription, subscribe } from '@/lib/billing/actions';
import { brl, dateBR, INVOICE_STATUS_LABEL, PLAN_HIGHLIGHTS, SUB_STATUS_LABEL, type Billing } from '@/lib/billing/types';

/** Assinatura por Pix em "Meu plano": planos à venda, situação, faturas, trocar e cancelar. */
export function SubscriptionPanel({ billing }: { billing: Billing }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const sub = billing.subscription;
  const owner = billing.role === 'owner';
  const active = sub?.status === 'active';
  const openInvoice = billing.invoices.find((i) => i.status === 'open');
  const nameOf = (code: string | null) => billing.plans.find((p) => p.code === code)?.name ?? code ?? '';

  const choose = (code: string) => {
    setMessage(null);
    startTransition(async () => {
      const r = await subscribe(code);
      if (!r.ok) return setMessage({ ok: false, text: r.message });
      if (r.data?.invoice) return router.push(`/app/configuracoes/plano/fatura/${r.data.invoice.id}`);
      setMessage({ ok: true, text: r.data?.scheduled ? `Troca agendada: o plano ${nameOf(code)} vale a partir da próxima fatura (${dateBR(r.data.from ?? null)}).` : 'Você continua no plano atual.' });
      router.refresh();
    });
  };
  const cancel = () => {
    if (!window.confirm(active ? `Cancelar a assinatura? O plano continua até ${dateBR(sub?.current_period_end ?? null)} e depois volta ao Gratuito.` : 'Cancelar o pedido de assinatura?')) return;
    setMessage(null);
    startTransition(async () => {
      const r = await cancelSubscription();
      setMessage(r.ok ? { ok: true, text: r.data?.until ? `Cancelado. O plano vale até ${dateBR(r.data.until)}.` : 'Pedido cancelado.' } : { ok: false, text: r.message });
      router.refresh();
    });
  };
  const resume = () => startTransition(async () => {
    const r = await resumeSubscription();
    setMessage(r.ok ? { ok: true, text: 'Assinatura mantida. A renovação segue normal.' } : { ok: false, text: r.message });
    router.refresh();
  });

  return (
    <section aria-labelledby="assinatura" className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="assinatura" className="font-display text-xl font-semibold">Assinatura</h2>
        {sub && sub.status !== 'canceled' && sub.status !== 'ended' && <Badge variant={active ? 'default' : 'secondary'}>{SUB_STATUS_LABEL[sub.status]}</Badge>}
      </div>

      {sub && active && (
        <div className="space-y-1 text-sm">
          <p>Plano <strong>{nameOf(sub.plan) || sub.plan}</strong>, pago até <strong>{dateBR(sub.current_period_end)}</strong>.</p>
          {sub.next_plan && <p className="text-muted-foreground">A partir da próxima fatura: plano {nameOf(sub.next_plan)}.</p>}
          {sub.cancel_at_period_end ? (
            <p className="text-muted-foreground">Cancelamento agendado: volta ao Gratuito depois de {dateBR(sub.current_period_end)}.</p>
          ) : <p className="text-muted-foreground">Renovação mensal: a fatura chega 7 dias antes, pelo Telegram ou e-mail.</p>}
        </div>
      )}

      {openInvoice && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="text-sm">
            <p className="font-medium">Fatura em aberto: {brl(openInvoice.amount_cents)}, vence {dateBR(openInvoice.due_on)}</p>
            <p className="text-muted-foreground">{openInvoice.reported_paid_at ? 'Você avisou que pagou. A confirmação sai em até 1 dia útil.' : 'Pague pelo Pix com o QR code ou o copia e cola.'}</p>
          </div>
          <Button asChild size="sm"><Link href={`/app/configuracoes/plano/fatura/${openInvoice.id}`}>{openInvoice.reported_paid_at ? 'Ver fatura' : 'Pagar com Pix'}</Link></Button>
        </div>
      )}

      {!billing.pix_ready || billing.plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">Os planos pagos abrem em breve. Registre seu interesse abaixo e avisamos.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {billing.plans.map((p) => {
            const current = active && sub?.plan === p.code;
            const next = active && sub?.next_plan === p.code;
            return (
              <div key={p.code} className={`flex flex-col gap-2 rounded-xl border p-4 ${current ? 'border-primary' : 'border-border'}`}>
                <p className="font-semibold">{p.name}</p>
                <p className="font-display text-2xl font-semibold">{brl(p.price_cents)}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                <p className="text-xs text-muted-foreground">
                  {p.max_active_patients === null ? 'Pacientes ativos sem limite' : `Até ${p.max_active_patients} pacientes ativos`} · {p.max_members === null ? 'equipe sem limite' : p.max_members === 1 ? '1 profissional' : `até ${p.max_members} profissionais`} · sem anúncios
                </p>
                {(PLAN_HIGHLIGHTS[p.code]?.length ?? 0) > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4 text-sm">
                    {PLAN_HIGHLIGHTS[p.code]?.map((h) => <li key={h}>{h}</li>)}
                  </ul>
                )}
                {owner && (
                  <Button type="button" size="sm" className="mt-auto" variant={current ? 'outline' : 'default'} disabled={pending || current || next} onClick={() => choose(p.code)}>
                    {pending && <Loader2 className="size-4 animate-spin" />}
                    {current ? 'Plano atual' : next ? 'Agendado' : active ? 'Trocar para este' : 'Assinar com Pix'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!owner && <p className="text-sm text-muted-foreground">Só o responsável (owner) do consultório assina ou cancela.</p>}

      {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-primary' : 'text-destructive'}`}>{message.text}</p>}

      {owner && sub && (sub.status === 'pending' || (active && !sub.cancel_at_period_end)) && (
        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={cancel} disabled={pending}>{active ? 'Cancelar assinatura' : 'Cancelar pedido'}</Button>
      )}
      {owner && active && sub?.cancel_at_period_end && (
        <Button type="button" variant="outline" size="sm" onClick={resume} disabled={pending}>Manter assinatura</Button>
      )}

      {billing.invoices.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Faturas</h3>
          <ul className="divide-y divide-border text-sm">
            {billing.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/app/configuracoes/plano/fatura/${i.id}`} className="hover:underline">{dateBR(i.period_start)} a {dateBR(i.period_end)} · {brl(i.amount_cents)}</Link>
                <span className={i.status === 'open' ? 'font-medium' : 'text-muted-foreground'}>{INVOICE_STATUS_LABEL[i.status]}{i.paid_at ? ` em ${new Date(i.paid_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
