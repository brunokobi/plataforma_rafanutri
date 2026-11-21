'use client';

import { Loader2, MessageSquarePlus } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { sendFeedback } from '@/lib/feedback/actions';
import { FEEDBACK_KINDS, validateFeedback, type FeedbackKind } from '@/lib/feedback/schema';
import { cn } from '@/lib/utils';

/** RN-047 — Botão "Feedback" no cabeçalho: tipo + texto, com a página atual (só o caminho). */
export function FeedbackButton({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>('idea');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validateFeedback({ kind, message });
    if (invalid) return setStatus({ kind: 'error', text: invalid });
    startTransition(async () => {
      const r = await sendFeedback({ kind, message, page: pathname });
      if (r.ok) {
        setMessage('');
        setStatus({ kind: 'ok', text: 'Obrigado! Recebemos seu feedback.' });
      } else setStatus({ kind: 'error', text: r.message ?? 'Algo deu errado.' });
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setStatus(null);
      }}
    >
      <SheetTrigger asChild>
        {variant === 'sidebar' ? (
          <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground">
            <MessageSquarePlus className="size-[18px] shrink-0" aria-hidden="true" /> Enviar feedback
          </button>
        ) : (
          <Button variant="ghost" size="sm" aria-label="Enviar feedback" title="Enviar feedback">
            <MessageSquarePlus className="size-4" /> <span className="hidden 2xl:inline">Feedback</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Enviar feedback</SheetTitle>
          <SheetDescription>Conte o que deu errado, o que faltou ou o que ajudou. Não inclua dados de pacientes.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} aria-label="Feedback" className="space-y-4 px-4 pb-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Tipo</legend>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_KINDS.map((k) => (
                <Button key={k.value} type="button" size="sm" variant={kind === k.value ? 'default' : 'outline'} aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>
                  {k.label}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="feedback-message">Mensagem</Label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={6}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <p className="text-xs text-muted-foreground">Enviamos junto só o endereço desta tela ({pathname}).</p>
          </div>
          {status && (
            <p role="status" className={cn('text-sm', status.kind === 'ok' ? 'text-primary' : 'text-destructive')}>{status.text}</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} Enviar
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
