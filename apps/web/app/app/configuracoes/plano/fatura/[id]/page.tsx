import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { AppHeader } from '@/components/app/app-header';
import { PixPayment } from '@/components/billing/pix-payment';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/auth/session';
import { getInvoice } from '@/lib/billing/actions';
import { brl, dateBR, INVOICE_STATUS_LABEL } from '@/lib/billing/types';

export const metadata: Metadata = { title: 'Fatura', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Fatura da assinatura: QR code do Pix, copia e cola e "Já paguei". */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/configuracoes/plano/fatura/${encodeURIComponent(id)}`);
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const qr = inv.status === 'open' ? await QRCode.toString(inv.pix_payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }) : null;
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-2xl space-y-6 px-5 py-8">
        <Link href="/app/configuracoes/plano" className="text-sm text-muted-foreground hover:text-foreground">← Meu plano</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Fatura · plano {inv.plan_name}</h1>
          <Badge variant={inv.status === 'paid' ? 'default' : inv.status === 'open' ? 'secondary' : 'outline'}>{INVOICE_STATUS_LABEL[inv.status]}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-5 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Valor</dt><dd className="text-lg font-semibold">{brl(inv.amount_cents)}</dd></div>
          <div><dt className="text-muted-foreground">Vencimento</dt><dd className="font-medium">{dateBR(inv.due_on)}</dd></div>
          <div className="col-span-2"><dt className="text-muted-foreground">Período</dt><dd className="font-medium">{dateBR(inv.period_start)} a {dateBR(inv.period_end)}</dd></div>
          <div className="col-span-2 sm:col-span-4"><dt className="text-muted-foreground">Identificador</dt><dd className="font-mono text-xs">{inv.txid}</dd></div>
        </dl>
        {inv.status === 'open' && qr && (
          <section aria-labelledby="pagar" className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 id="pagar" className="font-semibold">Pagar com Pix</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abra o app do seu banco e escolha Pix → ler QR code (ou Pix copia e cola).</li>
              <li>Confira o valor ({brl(inv.amount_cents)}){inv.receiver_name ? ` e o recebedor (${inv.receiver_name})` : ''} e conclua.</li>
              <li>Volte aqui e toque em <strong>Já paguei</strong>.</li>
            </ol>
            <div className="mx-auto w-56 rounded-xl bg-white p-2" role="img" aria-label="QR code do Pix" dangerouslySetInnerHTML={{ __html: qr }} />
            <PixPayment invoiceId={inv.id} payload={inv.pix_payload} reported={Boolean(inv.reported_paid_at)} canReport={inv.can_report} />
            {inv.reported_paid_at && <p className="text-sm text-primary">Você avisou o pagamento em {new Date(inv.reported_paid_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. A confirmação sai em até 1 dia útil.</p>}
          </section>
        )}
        {inv.status === 'paid' && <p className="text-sm">Pagamento confirmado em {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}. Obrigado!</p>}
        {inv.status === 'void' && <p className="text-sm text-muted-foreground">Esta fatura foi cancelada.</p>}
      </main>
    </div>
  );
}
