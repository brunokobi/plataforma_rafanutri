'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { checkInvoicePayment } from '@/lib/billing/actions';

/** Volta da InfinitePay (redirect_url com slug e transaction_nsu): confere o pagamento e atualiza a fatura. */
export function GatewayReturn({ invoiceId, slug, transactionNsu }: { invoiceId: string; slug: string; transactionNsu: string }) {
  const router = useRouter();
  const done = useRef(false);
  const [state, setState] = useState<'checking' | 'paid' | 'pending' | 'error'>('checking');
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    checkInvoicePayment(invoiceId, { slug, transaction_nsu: transactionNsu }).then((r) => {
      if (!r.ok) return setState('error');
      setState(r.data?.status === 'paid' ? 'paid' : 'pending');
      router.refresh();
    });
  }, [invoiceId, slug, transactionNsu, router]);
  if (state === 'checking') return <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Conferindo o pagamento na InfinitePay…</p>;
  if (state === 'paid') return <p role="status" className="text-sm font-medium text-primary">Pagamento confirmado. Seu plano já está liberado.</p>;
  if (state === 'pending') return <p role="status" className="text-sm">Ainda não vimos o pagamento confirmado. Se você pagou agora, ele é liberado assim que a InfinitePay avisar (em geral, em minutos).</p>;
  return <p role="alert" className="text-sm text-destructive">Não foi possível conferir o pagamento agora. Ele será confirmado pelo aviso da InfinitePay.</p>;
}
