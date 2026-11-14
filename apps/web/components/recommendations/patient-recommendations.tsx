'use client';

import { BookOpen, Check, Eye, EyeOff, Loader2, Pencil, Pin, PinOff, Plus, Send, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { groupByCategory, SUGGESTED_CATEGORIES } from '@/components/snippets/snippets-manager';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dateBR } from '@/lib/format/date';
import { createRecommendations, deleteRecommendation, updateRecommendation } from '@/lib/recommendations/actions';
import type { Recommendation, RecommendationInput, RecommendationResult } from '@/lib/recommendations/types';
import type { Snippet } from '@/lib/snippets/actions';

const when = (iso: string) => dateBR(iso, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** RN-208 — Recomendações do paciente: criar (do zero ou da biblioteca), publicar, fixar e ver a leitura. */
export function PatientRecommendations({ patientId, list, snippets, archived }: { patientId: string; list: Recommendation[]; snippets: Snippet[] | null; archived: boolean }) {
  const [mode, setMode] = useState<'none' | 'new' | 'library' | { edit: Recommendation }>('none');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<RecommendationResult>, ok: string) {
    setFeedback(null);
    start(async () => {
      const r = await fn();
      setFeedback(r.ok ? { ok: true, text: ok } : { ok: false, text: r.message });
      if (r.ok) setMode('none');
    });
  }
  const input = (r: Recommendation): RecommendationInput => ({ category: r.category, title: r.title, body: r.body, pinned: r.pinned });

  return (
    <section aria-labelledby="recs" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="recs" className="font-display text-xl font-semibold">Recomendações</h2>
        {!archived && mode === 'none' && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => { setMode('library'); setFeedback(null); }}><BookOpen className="size-4" /> Da biblioteca</Button>
            <Button type="button" onClick={() => { setMode('new'); setFeedback(null); }}><Plus className="size-4" /> Nova recomendação</Button>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Rascunhos ficam só com você. Publicadas aparecem na área do paciente, com as fixadas no topo; você vê quando ele leu.</p>
      {archived && <p className="text-sm text-muted-foreground">Paciente arquivado: reative para criar recomendações.</p>}
      {feedback && <p role="status" className={feedback.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{feedback.text}</p>}

      {mode === 'new' && (
        <RecommendationForm pending={pending} onCancel={() => setMode('none')}
          onSubmit={(v, publish) => run(() => createRecommendations(patientId, [v], publish), publish ? 'Recomendação publicada.' : 'Rascunho salvo.')} />
      )}
      {typeof mode === 'object' && (
        <RecommendationForm initial={mode.edit} pending={pending} onCancel={() => setMode('none')}
          onSubmit={(v, publish) => run(() => updateRecommendation(patientId, mode.edit.id, { ...v, status: publish ? 'published' : 'draft' }), publish ? 'Recomendação publicada.' : 'Rascunho salvo.')} />
      )}
      {mode === 'library' && (
        <LibraryPicker snippets={snippets} pending={pending} onCancel={() => setMode('none')}
          onSubmit={(items, publish) => run(() => createRecommendations(patientId, items, publish), publish ? `${items.length} ${items.length === 1 ? 'recomendação publicada' : 'recomendações publicadas'}.` : `${items.length} ${items.length === 1 ? 'rascunho salvo' : 'rascunhos salvos'}.`)} />
      )}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma recomendação ainda. Comece do zero ou pela biblioteca de orientações.</p>
      ) : (
        <ul className="space-y-3" aria-label="Recomendações do paciente">
          {list.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{r.category}{r.pinned && ' · fixada'}</p>
                  <p className="break-words font-semibold">{r.title}</p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-line break-words text-sm text-muted-foreground">{r.body}</p>
                  <p className="mt-2 text-xs">
                    {r.status === 'draft' ? (
                      <span className="rounded-full bg-muted px-2 py-0.5">Rascunho</span>
                    ) : (
                      <>
                        <span className="text-muted-foreground">Publicada {r.published_at ? when(r.published_at) : ''} · </span>
                        {r.read_at ? <span className="inline-flex items-center gap-1 text-primary"><Check className="size-3" aria-hidden="true" /> Lida em {when(r.read_at)}</span> : <span className="text-muted-foreground">Ainda não lida</span>}
                      </>
                    )}
                  </p>
                </div>
                {!archived && (
                  <div className="flex flex-wrap gap-1">
                    {r.status === 'draft' ? (
                      <Button type="button" size="sm" disabled={pending} onClick={() => run(() => updateRecommendation(patientId, r.id, { ...input(r), status: 'published' }), 'Recomendação publicada.')}><Send className="size-4" /> Publicar</Button>
                    ) : (
                      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateRecommendation(patientId, r.id, { ...input(r), status: 'draft' }), 'Voltou para rascunho: o paciente não vê mais.')}><EyeOff className="size-4" /> Despublicar</Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={r.pinned ? `Desafixar ${r.title}` : `Fixar ${r.title}`}
                      onClick={() => run(() => updateRecommendation(patientId, r.id, { ...input(r), pinned: !r.pinned, status: r.status }), r.pinned ? 'Desafixada.' : 'Fixada no topo.')}>
                      {r.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pending || mode !== 'none'} aria-label={`Editar ${r.title}`} onClick={() => { setMode({ edit: r }); setFeedback(null); }}><Pencil className="size-4" /></Button>
                    <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Excluir ${r.title}`}
                      onClick={() => { if (window.confirm(`Excluir "${r.title}"? O paciente deixa de ver.`)) run(() => deleteRecommendation(patientId, r.id), 'Recomendação excluída.'); }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecommendationForm({ initial, pending, onSubmit, onCancel }: { initial?: Recommendation; pending: boolean; onSubmit: (v: RecommendationInput, publish: boolean) => void; onCancel: () => void }) {
  const [category, setCategory] = useState(initial?.category ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const submit = (publish: boolean) => onSubmit({ category, title, body, pinned }, publish);
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(true); }} aria-label={initial ? `Editar ${initial.title}` : 'Nova recomendação'} className="space-y-4 rounded-2xl border border-border bg-card p-5">
      {initial?.status === 'published' && initial.read_at && (
        <Alert><Eye /><AlertDescription>Mudar o título ou o texto marca a recomendação como nova para o paciente.</AlertDescription></Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rec-category">Categoria</Label>
          <Input id="rec-category" list="rec-categories" value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="rec-categories">{SUGGESTED_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-title">Título</Label>
          <Input id="rec-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rec-body">Texto para o paciente</Label>
        <textarea id="rec-body" rows={5} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Fixar no topo</label>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="button" variant="outline" onClick={() => submit(false)} disabled={pending}>Salvar rascunho</Button>
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Publicar</Button>
      </div>
    </form>
  );
}

function LibraryPicker({ snippets, pending, onSubmit, onCancel }: { snippets: Snippet[] | null; pending: boolean; onSubmit: (items: RecommendationInput[], publish: boolean) => void; onCancel: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  if (snippets === null) return <p className="text-sm text-destructive">Não foi possível carregar a biblioteca agora.</p>;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const items = snippets.filter((s) => picked.has(s.id)).map((s) => ({ category: s.category, title: s.title, body: s.body }));
  return (
    <div role="group" aria-label="Biblioteca de orientações" className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">Marque as orientações e publique todas de uma vez (por exemplo, o pacote da primeira consulta).</p>
      {groupByCategory(snippets).map(([cat, list]) => (
        <fieldset key={cat} className="space-y-1">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{cat}</legend>
          {list.map((s) => (
            <label key={s.id} className="flex min-h-9 items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
              <span><span className="font-medium">{s.title}</span> <span className="text-muted-foreground">— {s.body.length > 90 ? `${s.body.slice(0, 90)}…` : s.body}</span></span>
            </label>
          ))}
        </fieldset>
      ))}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="button" variant="outline" disabled={pending || items.length === 0} onClick={() => onSubmit(items, false)}>Salvar como rascunho</Button>
        <Button type="button" disabled={pending || items.length === 0} onClick={() => onSubmit(items, true)}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Publicar selecionadas ({items.length})
        </Button>
      </div>
    </div>
  );
}
