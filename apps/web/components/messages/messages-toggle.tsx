'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setMessagesEnabled } from '@/lib/messages/actions';
import { cn } from '@/lib/utils';

/** Liga ou desliga o recebimento de mensagens dos pacientes (o consultório pode pausar). */
export function MessagesToggle({ enabled: initial }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, start] = useTransition();
  const flip = () => start(async () => {
    const r = await setMessagesEnabled(!enabled);
    if (r.ok) {
      setEnabled(Boolean(r.enabled));
      toast.success(r.enabled ? 'Pacientes podem mandar mensagens pelo app.' : 'Mensagens dos pacientes pausadas. Você ainda pode escrever para eles.');
    } else toast.error('Não foi possível mudar agora.');
  });
  return (
    <button type="button" role="switch" aria-checked={enabled} disabled={pending} onClick={flip}
      className="flex min-h-11 items-center gap-2.5 rounded-full px-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60">
      <span>{enabled ? 'Recebendo' : 'Pausado'}</span>
      <span aria-hidden="true" className={cn('relative h-6 w-10 rounded-full transition-colors', enabled ? 'bg-primary' : 'bg-muted-foreground/30')}>
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
      <span className="sr-only">Receber mensagens dos pacientes</span>
    </button>
  );
}
