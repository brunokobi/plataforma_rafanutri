'use client';

import { BookText, Loader2, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listSnippets, type Snippet } from '@/lib/snippets/actions';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Filtra por título, categoria ou texto (sem acento). */
export function filterSnippets(list: Snippet[], query: string): Snippet[] {
  const q = norm(query.trim());
  return q ? list.filter((s) => norm(`${s.title} ${s.category} ${s.body}`).includes(q)) : list;
}

/**
 * Escolher uma orientação da biblioteca para inserir no texto. Abre pelo botão ou, no campo de texto,
 * ao digitar "/" no começo de uma linha (o pai incrementa `openSignal`).
 */
export function SnippetPicker({ onPick, openSignal }: { onPick: (s: Snippet) => void; openSignal?: number }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Snippet[] | null | undefined>(undefined);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Abre quando o pai muda o sinal (atalho "/"): ajuste de estado durante a renderização, sem efeito.
  const [seenSignal, setSeenSignal] = useState(openSignal);
  if (openSignal !== seenSignal) {
    setSeenSignal(openSignal);
    if (openSignal) setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (list !== undefined) return;
    let cancelled = false;
    void listSnippets().then((r) => {
      if (!cancelled) setList(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, list]);

  const shown = useMemo(() => filterSnippets(list ?? [], q), [list, q]);
  const pick = (s: Snippet) => {
    onPick(s);
    setOpen(false);
    setQ('');
  };

  return (
    <div className="relative">
      <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <BookText className="size-4" /> Inserir orientação
      </Button>
      {open && (
        <div role="dialog" aria-label="Orientações da biblioteca" className="absolute z-30 mt-1 w-[min(28rem,90vw)] rounded-xl border border-border bg-popover p-3 shadow-lg">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && shown[0]) {
                  e.preventDefault();
                  pick(shown[0]);
                }
              }}
              placeholder="Buscar orientação"
              aria-label="Buscar orientação"
              className="pl-9"
            />
          </div>
          <div className="mt-2 max-h-64 overflow-auto">
            {list === undefined ? (
              <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
            ) : list === null ? (
              <p className="p-2 text-sm text-destructive">Não foi possível carregar as orientações.</p>
            ) : shown.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">
                {list.length === 0 ? 'Nenhuma orientação cadastrada. Crie em Orientações, no menu.' : 'Nada encontrado.'}
              </p>
            ) : (
              <ul role="listbox" aria-label="Orientações">
                {shown.map((s) => (
                  <li key={s.id}>
                    <button type="button" role="option" aria-selected="false" onClick={() => pick(s)} className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                      <span className="font-medium">{s.title}</span>
                      <span className="ml-1 text-xs text-muted-foreground">· {s.category}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
