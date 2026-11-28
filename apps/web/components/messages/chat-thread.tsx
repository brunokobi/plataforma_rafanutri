'use client';

import { AlertCircle, ArrowDown, Check, CheckCheck, Clock, Loader2, RotateCcw, SendHorizontal } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { chatRows, linkify, mergeMessages, timeLabel, MAX_BODY, type ChatMessage, type ChatPage, type Sender, type SendResult } from '@/lib/messages/types';
import { cn } from '@/lib/utils';

type Pending = { tmp: string; body: string; at: string; state: 'sending' | 'failed'; error?: string };

const POLL_VISIBLE_MS = 3000;
const POLL_HIDDEN_MS = 30000;

export interface ChatThreadProps {
  me: Sender;
  initial: ChatPage;
  /** Busca novas (after) ou anteriores (before). Server Action já ligada à conversa. */
  fetchPage: (cur: { after?: string; before?: string }) => Promise<ChatPage | null>;
  send: (body: string) => Promise<SendResult>;
  /** Topo fixo da conversa (nome, voltar, ações). */
  header: ReactNode;
  /** Quando há aviso no lugar do campo de texto (ex.: mensagens desligadas). */
  blocked?: string | null;
  /** Texto quando ainda não há mensagens. */
  empty?: ReactNode;
  placeholder?: string;
  /** Cor das minhas mensagens (marca do consultório na área do paciente). */
  accent?: string | null;
  className?: string;
}

/**
 * Conversa no estilo dos apps de mensagem: balões, separador de dia, hora e tiques de entregue/lida,
 * envio otimista com nova tentativa, novas mensagens a cada 3 s com a tela aberta e campo que cresce.
 */
export function ChatThread({ me, initial, fetchPage, send, header, blocked = null, empty, placeholder = 'Mensagem', accent = null, className }: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [hasMore, setHasMore] = useState(initial.has_more);
  const [peerReadAt, setPeerReadAt] = useState<string | null>(initial.peer_read_at);
  const [pending, setPending] = useState<Pending[]>([]);
  const [text, setText] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [offline, setOffline] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const keepOffset = useRef<number | null>(null);
  const lastAt = useRef<string | null>(initial.messages.at(-1)?.created_at ?? null);
  const fails = useRef(0);
  const busy = useRef(false);

  const rows = useMemo(() => chatRows(messages), [messages]);

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottom.current = true;
    setUnseen(0);
  }, []);

  // Abre já no fim da conversa.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Depois de cada mudança: segura a posição ao carregar as anteriores; desce se a pessoa já estava no fim.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pending]);

  const absorb = useCallback((page: ChatPage) => {
    if (page.peer_read_at) setPeerReadAt(page.peer_read_at);
    if (!page.messages.length) return;
    lastAt.current = page.messages.at(-1)!.created_at > (lastAt.current ?? '') ? page.messages.at(-1)!.created_at : lastAt.current;
    setMessages((cur) => {
      const known = new Set(cur.map((m) => m.id));
      const fresh = page.messages.filter((m) => !known.has(m.id) && m.sender !== me).length;
      if (fresh && !atBottom.current) setUnseen((n) => n + fresh);
      return mergeMessages(cur, page.messages);
    });
  }, [me]);

  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const page = await fetchPage(lastAt.current ? { after: lastAt.current } : {});
      if (!page) throw new Error('falha');
      fails.current = 0;
      setOffline(false);
      absorb(page);
    } catch {
      fails.current += 1;
      if (fails.current >= 2) setOffline(true);
    } finally {
      busy.current = false;
    }
  }, [fetchPage, absorb]);

  // Novas mensagens: a cada 3 s com a tela visível, a cada 30 s em segundo plano, e na hora ao voltar.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const loop = () => {
      if (stopped) return;
      timer = setTimeout(async () => {
        await poll();
        loop();
      }, document.visibilityState === 'visible' ? POLL_VISIBLE_MS : POLL_HIDDEN_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        void poll().then(loop);
      }
    };
    loop();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [poll]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || !messages.length) return;
    setLoadingOlder(true);
    const page = await fetchPage({ before: messages[0]!.created_at }).catch(() => null);
    setLoadingOlder(false);
    if (!page) return;
    const el = scroller.current;
    if (el) keepOffset.current = el.scrollHeight - el.scrollTop;
    setHasMore(page.has_more);
    setMessages((cur) => mergeMessages(cur, page.messages));
  }, [fetchPage, hasMore, loadingOlder, messages]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current && unseen) setUnseen(0);
    if (el.scrollTop < 120) void loadOlder();
  };

  const deliver = useCallback(async (p: Pending) => {
    const r = await send(p.body).catch((): SendResult => ({ ok: false, message: 'Sem conexão com o servidor. Toque para tentar de novo.', retry: true }));
    if (r.ok) {
      setPending((cur) => cur.filter((x) => x.tmp !== p.tmp));
      absorb({ messages: [r.message], has_more: false, peer_read_at: null });
    } else {
      setPending((cur) => cur.map((x) => (x.tmp === p.tmp ? { ...x, state: 'failed', error: r.message } : x)));
    }
  }, [send, absorb]);

  const submit = () => {
    const body = text.trim();
    if (!body || body.length > MAX_BODY) return;
    const p: Pending = { tmp: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, body, at: new Date().toISOString(), state: 'sending' };
    setPending((cur) => [...cur, p]);
    setText('');
    atBottom.current = true;
    requestAnimationFrame(() => toBottom(true));
    void deliver(p);
    input.current?.focus();
  };

  const retry = (p: Pending) => {
    setPending((cur) => cur.map((x) => (x.tmp === p.tmp ? { ...x, state: 'sending', error: undefined } : x)));
    void deliver({ ...p, state: 'sending' });
  };

  const discard = (p: Pending) => setPending((cur) => cur.filter((x) => x.tmp !== p.tmp));

  // Campo que cresce até ~6 linhas.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // No computador, Enter envia e Shift+Enter quebra linha; no celular, Enter quebra linha (o botão envia).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      submit();
    }
  };

  const mineStyle = accent ? { backgroundColor: accent, color: '#fff' } : undefined;
  const isRead = (m: ChatMessage) => Boolean(m.read_at || (peerReadAt && m.created_at <= peerReadAt));

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {header}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {offline && (
          <p role="status" className="absolute inset-x-0 top-2 z-10 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm dark:bg-amber-950 dark:text-amber-100">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Sem conexão, tentando de novo…
          </p>
        )}
        <div
          ref={scroller}
          onScroll={onScroll}
          className="chat-wallpaper min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6"
        >
          <div role="log" aria-live="polite" aria-label="Mensagens" className="mx-auto flex max-w-3xl flex-col">
            {hasMore && (
              <div className="flex justify-center py-2">
                <button type="button" onClick={() => void loadOlder()} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-background/90 px-3 text-xs font-medium text-muted-foreground shadow-sm">
                  {loadingOlder && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />} Mensagens anteriores
                </button>
              </div>
            )}
            {!messages.length && !pending.length && (
              <div className="mx-auto my-10 max-w-sm rounded-2xl bg-background/90 px-5 py-4 text-center text-sm text-muted-foreground shadow-sm">{empty ?? 'Nenhuma mensagem ainda. Escreva a primeira!'}</div>
            )}
            {rows.map((r) => r.kind === 'day' ? (
              <div key={r.key} className="sticky top-1 z-[1] flex justify-center py-2">
                <span className="rounded-full bg-background/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm">{r.label}</span>
              </div>
            ) : (
              <Bubble key={r.key} mine={r.message.sender === me} first={r.first} last={r.last} body={r.message.body} time={timeLabel(r.message.created_at)} style={r.message.sender === me ? mineStyle : undefined}
                status={r.message.sender === me ? (isRead(r.message) ? 'read' : 'sent') : null} />
            ))}
            {pending.map((p, i) => (
              <div key={p.tmp} className="flex flex-col items-end">
                <Bubble mine first={i === 0 && messages.at(-1)?.sender !== me} last body={p.body} time={timeLabel(p.at)} style={mineStyle} status={p.state} />
                {p.state === 'failed' && (
                  <div className="mb-1 mr-1 flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-destructive"><AlertCircle className="size-3.5" aria-hidden="true" />{p.error ?? 'Não enviada.'}</span>
                    <button type="button" onClick={() => retry(p)} className="inline-flex min-h-8 items-center gap-1 font-semibold text-primary"><RotateCcw className="size-3.5" aria-hidden="true" />Tentar de novo</button>
                    <button type="button" onClick={() => discard(p)} className="min-h-8 text-muted-foreground">Apagar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {unseen > 0 && (
          <button type="button" onClick={() => toBottom(true)} className="absolute bottom-3 right-4 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-lg">
            <ArrowDown className="size-4" aria-hidden="true" /> {unseen === 1 ? '1 nova' : `${unseen} novas`}
          </button>
        )}
      </div>

      {blocked ? (
        <p className="border-t border-border bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground">{blocked}</p>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="border-t border-border/70 bg-background/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-4"
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <label htmlFor="chat-input" className="sr-only">Escreva uma mensagem</label>
            <textarea
              id="chat-input"
              ref={input}
              rows={1}
              value={text}
              maxLength={MAX_BODY}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              enterKeyHint="send"
              autoComplete="off"
              className="max-h-40 min-h-11 flex-1 resize-none overflow-y-auto rounded-3xl [scrollbar-width:none] border border-border bg-card px-4 py-[11px] text-base leading-snug outline-none placeholder:text-muted-foreground focus:border-primary/60 sm:text-[15px]"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!text.trim()}
              onMouseDown={(e) => e.preventDefault()}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-[transform,opacity] active:scale-95 disabled:opacity-40"
              style={accent ? { backgroundColor: accent, color: '#fff' } : undefined}
            >
              <SendHorizontal className="size-5" aria-hidden="true" />
            </button>
          </div>
          {text.length > MAX_BODY - 200 && <p className="mx-auto mt-1 max-w-3xl px-3 text-right text-xs text-muted-foreground">{text.length}/{MAX_BODY}</p>}
        </form>
      )}
    </div>
  );
}

function Bubble({ mine, first, last, body, time, status, style }: { mine: boolean; first: boolean; last: boolean; body: string; time: string; status: 'sent' | 'read' | 'sending' | 'failed' | null; style?: React.CSSProperties }) {
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start', first ? 'mt-2' : 'mt-0.5')}>
      <div
        style={style}
        className={cn(
          'relative max-w-[82%] rounded-2xl px-3 pb-1.5 pt-2 text-[15px] leading-snug shadow-sm sm:max-w-[70%]',
          mine ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground ring-1 ring-border/60',
          mine && first && 'rounded-tr-md',
          !mine && first && 'rounded-tl-md',
          status === 'failed' && 'opacity-70',
        )}
      >
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {linkify(body).map((part, i) => part.href ? (
            <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">{part.text}</a>
          ) : <span key={i}>{part.text}</span>)}
          {/* Espaço reservado para a hora não encostar no texto */}
          <span aria-hidden="true" className={cn('inline-block', mine ? 'w-16' : 'w-11')} />
        </p>
        <span className={cn('absolute bottom-1 right-2.5 flex items-center gap-0.5 text-[11px] tabular-nums', mine ? 'opacity-80' : 'text-muted-foreground')}>
          {time}
          {status === 'sending' && <Clock className="size-3.5" aria-label="Enviando" />}
          {status === 'sent' && <Check className="size-3.5" aria-label="Enviada" />}
          {status === 'read' && <CheckCheck className="size-3.5 text-sky-300 dark:text-sky-400" aria-label="Lida" />}
          {status === 'failed' && <AlertCircle className="size-3.5" aria-label="Não enviada" />}
        </span>
        {last && <span className="sr-only">{mine ? 'Você' : 'Recebida'}</span>}
      </div>
    </div>
  );
}
