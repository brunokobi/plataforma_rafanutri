'use client';

import { Check, ClipboardCopy, ExternalLink, Loader2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createMyAccountTelegramLink, unlinkMyAccountTelegram } from '@/lib/billing/actions';
import type { UserNotificationPrefs } from '@/lib/billing/types';

/** Telegram da própria conta (nutricionista, admin): faturas, pagamentos e assinatura. */
export function AccountTelegram({ prefs, title = 'Seus avisos da conta', description }: { prefs: UserNotificationPrefs; title?: string; description?: string }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section aria-labelledby="conta-telegram" className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Send className="size-4 text-[#229ED9]" aria-hidden="true" />
        <h2 id="conta-telegram" className="font-semibold">{title}</h2>
        {prefs.telegram_linked ? <Badge>Telegram ligado</Badge> : <Badge variant="outline">Só e-mail</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        {description ?? 'Faturas da assinatura, confirmação de pagamento e avisos da sua conta.'}{' '}
        {prefs.telegram_linked ? `Chegam no Telegram${prefs.telegram_name ? ` de ${prefs.telegram_name}` : ''}.` : `Hoje chegam por e-mail${prefs.email ? ` (${prefs.email})` : ''}. Ligue o Telegram para receber na hora.`}
      </p>
      {prefs.telegram_linked ? (
        <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => startTransition(async () => {
          const r = await unlinkMyAccountTelegram();
          if (r.ok) router.refresh(); else setMessage(r.message);
        })}>Desligar Telegram</Button>
      ) : prefs.telegram_ready ? (
        <>
          <Button type="button" size="sm" disabled={pending} onClick={() => startTransition(async () => {
            setMessage(null);
            const r = await createMyAccountTelegramLink();
            if (!r.ok || !r.data) return setMessage(r.ok ? 'Não foi possível gerar o link.' : r.message);
            setLink(r.data.url);
            setQr(await QRCode.toDataURL(r.data.url, { margin: 1, width: 200 }).catch(() => null));
            window.open(r.data.url, '_blank', 'noopener');
          })}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Ligar meu Telegram
          </Button>
          {link && (
            <div className="flex flex-wrap items-start gap-4 rounded-lg bg-muted/50 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado no navegador (data URL) */}
              {qr && <img src={qr} alt="QR code para ligar o Telegram" className="size-32 rounded-md bg-white p-1" />}
              <div className="min-w-52 flex-1 space-y-2">
                <p className="text-sm">Abra o link no celular (ou leia o QR) e toque em &quot;Iniciar&quot;. Depois, atualize esta página.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}>
                    {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? 'Copiado' : 'Copiar link'}
                  </Button>
                  <Button asChild size="sm" variant="outline"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /> Abrir no Telegram</a></Button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : <p className="text-sm text-muted-foreground">O Telegram ainda não foi ligado na plataforma.</p>}
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    </section>
  );
}
