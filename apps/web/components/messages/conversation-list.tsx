'use client';

import { Check, CheckCheck, MessageCircle, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { avatarInitials } from '@/components/messages/avatar';
import { getConversations } from '@/lib/messages/actions';
import { listTimeLabel, type Conversation } from '@/lib/messages/types';
import { cn } from '@/lib/utils';

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Lista de conversas do consultório (mais recente primeiro), com busca e atualização a cada 10 s. */
export function ConversationList({ initial, activeId = null }: { initial: Conversation[]; activeId?: string | null }) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      getConversations().then((r) => { if (alive && r) setItems(r.conversations); }).catch(() => undefined);
    };
    const t = setInterval(run, 10000);
    document.addEventListener('visibilitychange', run);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', run); };
  }, []);

  const shown = useMemo(() => {
    const f = fold(q.trim());
    return f ? items.filter((c) => fold(c.name).includes(f)) : items;
  }, [items, q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2 pt-1">
        <label className="flex min-h-10 items-center gap-2 rounded-full bg-muted px-3.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">Buscar conversa</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversa" className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm" />
        </label>
      </div>
      {shown.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          <MessageCircle className="mx-auto mb-3 size-8 opacity-60" aria-hidden="true" />
          {items.length === 0 ? (
            <>Nenhuma conversa ainda. Quando um paciente com acesso ao app mandar mensagem, ela aparece aqui. Para começar uma, abra a ficha do paciente e toque em <strong>Mensagem</strong>.</>
          ) : 'Nenhuma conversa com esse nome.'}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-contain">
          {shown.map((c) => {
            const mine = c.last.sender === 'professional';
            const active = c.patient_id === activeId;
            return (
              <li key={c.patient_id}>
                <Link
                  href={`/app/mensagens/${c.patient_id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex min-h-[72px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/70', active && 'bg-secondary/70 hover:bg-secondary/70')}
                >
                  <span aria-hidden="true" className={cn('grid size-12 shrink-0 place-items-center rounded-full bg-primary/12 text-[15px] font-semibold text-primary', !c.active && 'opacity-60')}>
                    {avatarInitials(c.name)}
                  </span>
                  <span className="min-w-0 flex-1 border-b border-border/60 pb-2.5 pt-1">
                    <span className="flex items-baseline gap-2">
                      <span className={cn('min-w-0 flex-1 truncate text-[15px]', c.unread ? 'font-bold' : 'font-semibold')}>{c.name}</span>
                      <span className={cn('shrink-0 text-xs tabular-nums', c.unread ? 'font-semibold text-primary' : 'text-muted-foreground')}>{listTimeLabel(c.last.created_at)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {mine && (c.last.read_at ? <CheckCheck className="size-4 shrink-0 text-sky-500" aria-label="Lida" /> : <Check className="size-4 shrink-0 text-muted-foreground" aria-label="Enviada" />)}
                      <span className={cn('min-w-0 flex-1 truncate text-sm', c.unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {c.last.body.replace(/\s+/g, ' ')}
                      </span>
                      {c.unread > 0 && (
                        <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground" aria-label={`${c.unread} não lidas`}>{c.unread}</span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
