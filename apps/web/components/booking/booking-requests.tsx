'use client';

import { Check, Globe, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { decideBookingRequest } from '@/lib/booking/actions';
import { whenLabel, type BookingRequest } from '@/lib/booking/types';

/** RN-068 — Pedidos de agendamento online aguardando confirmação (topo da agenda). */
export function BookingRequests({ list }: { list: BookingRequest[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (list.length === 0 && !feedback) return null;
  function decide(r: BookingRequest, confirm: boolean) {
    if (!confirm && !window.confirm(`Recusar o pedido de ${r.full_name}? O horário fica livre de novo.`)) return;
    setFeedback(null);
    start(async () => {
      const res = await decideBookingRequest(r.id, confirm);
      setFeedback(res.ok ? { ok: true, text: confirm ? `Consulta de ${r.full_name} marcada.` : `Pedido de ${r.full_name} recusado.` } : { ok: false, text: res.message });
      if (res.ok) router.refresh();
    });
  }
  return (
    <section aria-labelledby="pedidos-online" className="space-y-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
      <h2 id="pedidos-online" className="flex items-center gap-2 font-semibold"><Globe className="size-4" aria-hidden="true" /> Pedidos de agendamento online ({list.length})</h2>
      {feedback && <p role="status" className={feedback.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{feedback.text}</p>}
      <ul className="space-y-2" aria-label="Pedidos de agendamento">
        {list.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.full_name} · {whenLabel(r.starts_at)} · {r.mode === 'online' ? 'on-line' : 'presencial'}</p>
              <p className="text-muted-foreground">{r.phone} · {r.email}{r.message ? ` · “${r.message}”` : ''}</p>
            </div>
            <Button type="button" size="sm" disabled={pending} onClick={() => decide(r, true)} aria-label={`Confirmar pedido de ${r.full_name}`}><Check className="size-4" /> Confirmar</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => decide(r, false)} aria-label={`Recusar pedido de ${r.full_name}`}><X className="size-4" /> Recusar</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
