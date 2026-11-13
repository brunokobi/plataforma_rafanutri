'use client';

import { CalendarDays, ClipboardList, FileSignature, Ruler, Utensils } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoteEditor } from '@/components/notes/note-editor';
import { NoteText } from '@/components/notes/note-text';
import { createNote, deleteNote, signNote, updateNote } from '@/lib/notes/actions';
import type { ClinicalNote, NoteResult } from '@/lib/notes/schema';
import { KIND_LABEL, type NoteChain, type TimelineEvent, type TimelineKind } from '@/lib/notes/timeline';
import { cn } from '@/lib/utils';

const ICON = { evolucao: FileSignature, consulta: CalendarDays, anamnese: ClipboardList, avaliacao: Ruler, plano: Utensils } as const;
const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** Filtra os eventos pelos tipos marcados (nenhum marcado = todos). */
export function filterEvents(events: TimelineEvent[], kinds: Set<TimelineKind>): TimelineEvent[] {
  return kinds.size === 0 ? events : events.filter((e) => kinds.has(e.kind));
}

function Signature({ note }: { note: ClinicalNote }) {
  return note.signed_at ? (
    <p className="text-xs text-muted-foreground">
      Assinada por <span className="font-medium text-foreground">{note.signer_name}</span>
      {note.signer_crn ? ` · ${note.signer_crn}` : ''} em {when(note.signed_at)}
    </p>
  ) : (
    <p className="text-xs text-muted-foreground">Rascunho de {when(note.date_updated ?? note.date_created)} · ainda não assinada</p>
  );
}

function NoteCard({ chain, patientId, archived }: { chain: NoteChain; patientId: string; archived: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit' | 'rectify'>('view');
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const note = chain.current;
  const done = (r: NoteResult) => {
    if (r.ok) {
      setMode('view');
      router.refresh();
    }
    return r;
  };
  const act = (fn: () => Promise<NoteResult>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setMessage(r.message);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">Evolução</h3>
        {!note.signed_at && <Badge variant="outline">Rascunho</Badge>}
        {chain.previous.length > 0 && <Badge variant="secondary">Retificada</Badge>}
      </div>
      {mode === 'edit' ? (
        <NoteEditor
          id={`note-edit-${note.id}`}
          label="Editar rascunho"
          initial={note.body}
          onCancel={() => setMode('view')}
          onSave={async (body, sign) => {
            const r = await updateNote(patientId, note.id, body);
            if (!r.ok || !sign) return done(r);
            return done(await signNote(patientId, note.id));
          }}
        />
      ) : (
        <>
          <NoteText text={note.body} />
          <Signature note={note} />
        </>
      )}
      {mode === 'rectify' && (
        <NoteEditor
          id={`note-rectify-${note.id}`}
          label="Retificação (a versão assinada continua no histórico)"
          initial={note.body}
          onCancel={() => setMode('view')}
          onSave={async (body, sign) => done(await createNote(patientId, body, { supersedesId: note.id, sign }))}
        />
      )}
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      {mode === 'view' && !archived && (
        <div className="flex flex-wrap gap-2">
          {!note.signed_at && note.own && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => setMode('edit')} disabled={pending}>Editar</Button>
              <Button
                type="button" size="sm" disabled={pending}
                onClick={() => window.confirm('Depois de assinada, a evolução não pode ser alterada nem apagada; só retificada. Assinar agora?') && act(() => signNote(patientId, note.id))}
              >
                Assinar
              </Button>
              <Button
                type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending}
                onClick={() => window.confirm('Apagar este rascunho?') && act(() => deleteNote(patientId, note.id))}
              >
                Apagar rascunho
              </Button>
            </>
          )}
          {note.signed_at && <Button type="button" size="sm" variant="outline" onClick={() => setMode('rectify')}>Retificar</Button>}
        </div>
      )}
      {chain.previous.length > 0 && (
        <div>
          <button type="button" className="text-sm font-medium text-primary hover:underline" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Esconder' : 'Ver'} versões anteriores ({chain.previous.length})
          </button>
          {showHistory && (
            <ol className="mt-2 space-y-3 border-l-2 border-border pl-4">
              {chain.previous.map((p) => (
                <li key={p.id} className="space-y-1 opacity-80">
                  <NoteText text={p.body} />
                  <Signature note={p} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export function PatientChart({ patientId, events, archived, notesUnavailable }: { patientId: string; events: TimelineEvent[]; archived: boolean; notesUnavailable?: boolean }) {
  const router = useRouter();
  const [kinds, setKinds] = useState<Set<TimelineKind>>(new Set());
  const [editorKey, setEditorKey] = useState(0);
  const shown = filterEvents(events, kinds);
  const toggle = (k: TimelineKind) =>
    setKinds((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="space-y-8">
      {!archived && !notesUnavailable && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <NoteEditor
            key={editorKey}
            id="note-new"
            label="Nova evolução"
            onSave={async (body, sign) => {
              const r = await createNote(patientId, body, { sign });
              if (r.ok) {
                setEditorKey((k) => k + 1);
                router.refresh();
              }
              return r;
            }}
          />
        </section>
      )}

      <section aria-labelledby="timeline-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="timeline-title" className="font-display text-xl font-semibold">Linha do tempo</h2>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por tipo">
            {(Object.keys(KIND_LABEL) as TimelineKind[]).map((k) => (
              <Button key={k} type="button" size="sm" variant={kinds.has(k) ? 'default' : 'outline'} aria-pressed={kinds.has(k)} onClick={() => toggle(k)}>
                {KIND_LABEL[k]}
              </Button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {events.length === 0 ? 'Nada registrado ainda. Escreva a primeira evolução acima.' : 'Nenhum evento desse tipo.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {shown.map((e) => {
              const Icon = ICON[e.kind];
              return (
                <li key={`${e.kind}-${e.id}`} className={cn('flex gap-3 rounded-2xl border border-border bg-card p-4', e.kind === 'evolucao' && 'border-primary/30')}>
                  <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground"><time dateTime={e.at}>{e.kind === 'avaliacao' ? day(e.at) : when(e.at)}</time></p>
                    {e.kind === 'evolucao' ? (
                      <NoteCard chain={e.chain} patientId={patientId} archived={archived} />
                    ) : (
                      <>
                        <h3 className="font-medium">{e.href ? <Link href={e.href} className="hover:underline">{e.title}</Link> : e.title}</h3>
                        {e.detail && <p className="text-sm text-muted-foreground">{e.detail}</p>}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
