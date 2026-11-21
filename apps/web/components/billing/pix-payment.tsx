'use client';

import { Check, ClipboardCopy, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { reportPaid } from '@/lib/billing/actions';

/** Copia e cola do Pix e o botão "Já paguei". */
export function PixPayment({ invoiceId, payload, reported, canReport }: { invoiceId: string; payload: string; reported: boolean; canReport: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <label htmlFor="pix" className="text-sm font-medium">Pix copia e cola</label>
      <textarea id="pix" readOnly rows={4} value={payload} onFocus={(e) => e.currentTarget.select()} className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs break-all" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(payload); setCopied(true); } catch { setCopied(false); }
        }}>
          {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? 'Copiado' : 'Copiar código Pix'}
        </Button>
        {canReport && !reported && (
          <Button type="button" disabled={pending} onClick={() => startTransition(async () => {
            const r = await reportPaid(invoiceId);
            setMessage(r.ok ? { ok: true, text: 'Obrigado! Avisamos a Rafanutri. A confirmação sai em até 1 dia útil, pelo Telegram ou e-mail.' } : { ok: false, text: r.message });
            if (r.ok) router.refresh();
          })}>
            {pending && <Loader2 className="size-4 animate-spin" />} Já paguei
          </Button>
        )}
      </div>
      {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-primary' : 'text-destructive'}`}>{message.text}</p>}
    </div>
  );
}
