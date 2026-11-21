'use client';

import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { unsubscribeEmail } from '@/lib/notifications/actions';

/** Confirmação por clique (leitores de link dos provedores de e-mail abrem a página sozinhos). */
export function UnsubscribeButton({ token }: { token: string }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (result?.ok) {
    return (
      <div role="status" className="space-y-2">
        <h2 className="font-display text-xl font-semibold">Pronto, e-mails cancelados</h2>
        <p className="text-sm text-muted-foreground">{result.text}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Button type="button" disabled={pending} onClick={() => startTransition(async () => {
        const r = await unsubscribeEmail(token);
        setResult(r.ok
          ? { ok: true, text: `Você não vai mais receber avisos por e-mail de ${r.data?.practice ?? 'seu consultório'}. Para receber os lembretes de graça pelo Telegram, ou voltar a receber por e-mail, entre na sua área do paciente, em Avisos.` }
          : { ok: false, text: r.message });
      })}>
        {pending && <Loader2 className="size-4 animate-spin" />} Não quero mais avisos por e-mail
      </Button>
      {result && !result.ok && <p role="alert" className="text-sm text-destructive">{result.text}</p>}
    </div>
  );
}
