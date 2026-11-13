'use client';

import { Bold, List, Loader2 } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { SnippetPicker } from '@/components/snippets/snippet-picker';
import { Button } from '@/components/ui/button';
import { toggleBold, toggleList, type Edit } from '@/lib/notes/format';
import type { NoteResult } from '@/lib/notes/schema';

/** Insere o texto na posição do cursor, como linha própria. */
export function insertAt(text: string, pos: number, snippet: string): Edit {
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const lead = before === '' || before.endsWith('\n') ? '' : '\n';
  const trail = after === '' || after.startsWith('\n') ? '' : '\n';
  const piece = `${lead}${snippet.trim()}${trail}`;
  const caret = before.length + lead.length + snippet.trim().length;
  return { text: before + piece + after, start: caret, end: caret };
}

export function NoteEditor({
  id,
  label,
  initial = '',
  onSave,
  onCancel,
  allowDraft = true,
}: {
  id: string;
  label: string;
  initial?: string;
  onSave: (body: string, sign: boolean) => Promise<NoteResult>;
  onCancel?: () => void;
  allowDraft?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [signal, setSignal] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  const apply = (fn: (t: string, s: number, e: number) => Edit) => {
    const el = ref.current;
    if (!el) return;
    const r = fn(el.value, el.selectionStart, el.selectionEnd);
    setText(r.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };
  const save = (sign: boolean) => {
    if (!text.trim()) return setMessage('Escreva a evolução antes de salvar.');
    if (sign && !window.confirm('Depois de assinada, a evolução não pode ser alterada nem apagada; só retificada. Assinar agora?')) return;
    setMessage(null);
    startTransition(async () => {
      const r = await onSave(text, sign);
      if (r.ok) setText('');
      else setMessage(r.message);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Formatação">
          <Button type="button" variant="ghost" size="sm" onClick={() => apply(toggleBold)} aria-label="Negrito"><Bold className="size-4" /></Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => apply(toggleList)} aria-label="Lista"><List className="size-4" /></Button>
          <SnippetPicker openSignal={signal} onPick={(s) => apply((t, start) => insertAt(t, start, s.body))} />
        </div>
      </div>
      <textarea
        id={id}
        ref={ref}
        rows={6}
        maxLength={20000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          if (e.key === '/' && (el.selectionStart === 0 || el.value[el.selectionStart - 1] === '\n')) {
            e.preventDefault();
            setSignal((n) => n + 1);
          }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            apply(toggleBold);
          }
        }}
        aria-describedby={`${id}-help`}
        className="w-full rounded-md border border-input bg-transparent p-3 text-sm dark:bg-input/30"
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">**negrito**, linhas começando com “- ” viram lista; digite / no começo de uma linha para inserir uma orientação.</p>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>}
        {allowDraft && <Button type="button" variant="outline" onClick={() => save(false)} disabled={pending}>Salvar rascunho</Button>}
        <Button type="button" onClick={() => save(true)} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar e assinar</Button>
      </div>
    </div>
  );
}
