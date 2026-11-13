'use client';

import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteSnippet, saveSnippet, type Snippet } from '@/lib/snippets/actions';

export const SUGGESTED_CATEGORIES = ['Hidratação', 'Mastigação e refeições', 'Intestino', 'Treino', 'Compras e preparo', 'Sono'];

/** Agrupa por categoria, em ordem alfabética. */
export function groupByCategory(list: Snippet[]): Array<[string, Snippet[]]> {
  const map = new Map<string, Snippet[]>();
  for (const s of list) map.set(s.category, [...(map.get(s.category) ?? []), s]);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}

function SnippetForm({ initial, categories, onDone, onCancel }: { initial?: Snippet; categories: string[]; onDone: () => void; onCancel: () => void }) {
  const [category, setCategory] = useState(initial?.category ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-label={initial ? `Editar ${initial.title}` : 'Nova orientação'}
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        setMessage(null);
        startTransition(async () => {
          const r = await saveSnippet({ category, title, body }, initial?.id);
          if (r.ok) onDone();
          else {
            setErrors(r.fields ?? {});
            setMessage(r.message);
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sn-cat">Categoria</Label>
          <Input id="sn-cat" list="sn-cats" value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} aria-invalid={Boolean(errors.category)} />
          <datalist id="sn-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="sn-title">Título</Label>
          <Input id="sn-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(errors.title)} />
          {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="sn-body">Texto (vai para o plano como está)</Label>
        <textarea id="sn-body" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={Boolean(errors.body)} className="w-full rounded-md border border-input bg-transparent p-3 text-sm" />
        {errors.body && <p className="text-xs text-destructive">{errors.body}</p>}
      </div>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
      </div>
    </form>
  );
}

export function SnippetsManager({ snippets }: { snippets: Snippet[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Snippet | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const categories = [...new Set([...SUGGESTED_CATEGORIES, ...snippets.map((s) => s.category)])];
  const done = () => {
    setEditing(null);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setEditing('new')} disabled={editing !== null}><Plus className="size-4" /> Nova orientação</Button>
      </div>
      {editing === 'new' && <SnippetForm categories={categories} onDone={done} onCancel={() => setEditing(null)} />}
      {message && <p role="status" className="text-sm text-destructive">{message}</p>}
      {snippets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhuma orientação ainda. Crie textos que você repete nos planos (hidratação, mastigação, intestino, treino…) e insira no editor de plano com um clique ou digitando /.
        </p>
      ) : (
        groupByCategory(snippets).map(([cat, items]) => (
          <section key={cat} aria-label={cat}>
            <h2 className="font-display text-lg font-semibold">{cat}</h2>
            <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
              {items.map((s) => (
                <li key={s.id} className="px-4 py-3">
                  {editing !== 'new' && editing?.id === s.id ? (
                    <SnippetForm initial={s} categories={categories} onDone={done} onCancel={() => setEditing(null)} />
                  ) : (
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{s.title} {!s.own && <Badge variant="secondary">Biblioteca</Badge>}</p>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{s.body}</p>
                      </div>
                      {s.own && (
                        <>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(s)} disabled={editing !== null}><Pencil className="size-4" /> Editar</Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={busy === s.id}
                            aria-label={`Apagar ${s.title}`}
                            onClick={() => {
                              if (!window.confirm(`Apagar "${s.title}"? Planos que já usam o texto não mudam.`)) return;
                              setBusy(s.id);
                              startTransition(async () => {
                                const r = await deleteSnippet(s.id);
                                setBusy(null);
                                if (r.ok) router.refresh();
                                else setMessage(r.message);
                              });
                            }}
                          >
                            {busy === s.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Apagar
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
