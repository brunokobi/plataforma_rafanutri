'use client';

import { AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, Loader2, MapPin, Minus, WifiOff, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { outcomeOf, type OfflineOp } from '@/lib/offline/ops';
import { enqueue, offlineSupported, pending as pendingOps, remove } from '@/lib/offline/queue';
import { resizeImage } from '@/lib/recipes/resize-image';
import { SignaturePad } from '@/components/uan/signature-pad';
import { cancelChecklist, completeChecklist, saveAnswer, saveAnswerPhoto, saveSignature } from '@/lib/uan/checklist-actions';
import {
  ANSWER_LABEL,
  missingEvidence,
  needsEvidence,
  nextPending,
  numberValue,
  outsideRadius,
  photoUrl,
  signatureUrl,
  rangeLabel,
  runProgress,
  type AnswerValue,
  type ChecklistAnswer,
  type RunDetail,
} from '@/lib/uan/checklists';

const TEXTAREA = 'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';
const CHOICES: Array<{ value: AnswerValue; icon: typeof Check; tone: string }> = [
  { value: 'conform', icon: Check, tone: 'aria-pressed:bg-emerald-600 aria-pressed:text-white aria-pressed:border-emerald-600' },
  { value: 'non_conform', icon: X, tone: 'aria-pressed:bg-destructive aria-pressed:text-white aria-pressed:border-destructive' },
  { value: 'na', icon: Minus, tone: 'aria-pressed:bg-muted-foreground aria-pressed:text-background aria-pressed:border-muted-foreground' },
];
const chipTone = (a: ChecklistAnswer) =>
  missingEvidence(a) ? 'border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
    : a.value === 'conform' ? 'border-emerald-600 bg-emerald-600 text-white'
      : a.value === 'non_conform' ? 'border-destructive bg-destructive text-white'
        : a.value === 'na' ? 'border-muted-foreground bg-muted text-muted-foreground'
          : 'border-border bg-card';

const numberText = (a: ChecklistAnswer | undefined) => (a?.number_value === null || a?.number_value === undefined ? '' : String(a.number_value).replace('.', ','));
/** Primeiro item pendente (ou o primeiro de todos). */
const initialIndex = (answers: ChecklistAnswer[]) => {
  const p = nextPending(answers, 0);
  return Math.max(0, answers.findIndex((a) => a.position === (p ?? answers[0]?.position)));
};


/** Execução do checklist no celular: um item por vez, com revisão antes de concluir. */
export function ChecklistRunner({ detail }: { detail: RunDetail }) {
  const router = useRouter();
  const runId = detail.run.id;
  const [answers, setAnswers] = useState(detail.answers);
  const [index, setIndex] = useState(() => initialIndex(detail.answers));
  const [reviewing, setReviewing] = useState(() => nextPending(detail.answers, 0) === null);
  const [number, setNumber] = useState(() => numberText(detail.answers[initialIndex(detail.answers)]));
  const [comment, setComment] = useState(() => detail.answers[initialIndex(detail.answers)]?.comment ?? '');
  const [photoV, setPhotoV] = useState<Record<number, number>>({});
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [signed, setSigned] = useState(Boolean(detail.run.has_signature));
  const [signV, setSignV] = useState(0);
  const [signing, setSigning] = useState(false);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [completedLocally, setCompletedLocally] = useState(false);
  const [localPhotos, setLocalPhotos] = useState<Record<number, string>>({});
  const syncing = useRef(false);

  const a = answers[index]!;
  const progress = runProgress(answers);
  const far = outsideRadius(detail.run.geo_distance_m, detail.unit.geo_radius_m);

  const go = (i: number) => {
    const next = answers[i];
    if (!next) return;
    setIndex(i);
    setReviewing(false);
    setMessage(null);
    setNumber(numberText(next));
    setComment(next.comment ?? '');
  };
  const goPosition = (position: number) => go(answers.findIndex((x) => x.position === position));
  const merge = (patch: Partial<ChecklistAnswer> & { position: number }) =>
    setAnswers((list) => list.map((x) => (x.position === patch.position ? { ...x, ...patch } : x)));

  // ── Modo offline (RN-149): sem conexão, a operação vai para a fila do aparelho e é enviada depois ──
  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  const queueOp = async (op: OfflineOp) => {
    if (!offlineSupported()) return false;
    await enqueue(op);
    setQueued((q) => q + 1);
    return true;
  };
  const optimistic = (input: { value?: AnswerValue; number_value?: number | null; comment?: string | null }): ChecklistAnswer => {
    const isNa = input.value === 'na';
    const value: AnswerValue | null =
      a.kind === 'number' && !isNa ? numberValue(input.number_value ?? null, a.min_value, a.max_value) : (input.value ?? a.value);
    return {
      ...a,
      value,
      number_value: a.kind === 'number' && !isNa ? (input.number_value ?? null) : null,
      comment: input.comment === undefined ? a.comment : input.comment,
      answered_at: new Date().toISOString(),
    };
  };
  const afterSave = (updated: ChecklistAnswer, advance: boolean) => {
    merge(updated);
    // Avança sozinho quando o item está completo (sem evidência pendente).
    if (advance && !missingEvidence(updated)) {
      const list = answers.map((x) => (x.position === updated.position ? updated : x));
      const nextPos = nextPending(list, updated.position);
      if (nextPos === null) setReviewing(true);
      else goPosition(nextPos);
    }
  };

  const persist = (input: { value?: AnswerValue; number_value?: number | null; comment?: string | null }, advance: boolean) => {
    setMessage(null);
    startTransition(async () => {
      const offlinePath = async () => {
        const at = new Date().toISOString();
        if (await queueOp({ kind: 'answer', runId, position: a.position, input: { ...input, answered_at: at } as typeof input, at })) afterSave(optimistic(input), advance);
        else setMessage({ text: 'Sem conexão. Tente de novo quando a internet voltar.', error: true });
      };
      // Com fila pendente, tudo passa por ela (mantém a ordem) e o envio é disparado na hora.
      if (isOffline() || queued > 0) {
        await offlinePath();
        void sync();
        return;
      }
      let r: Awaited<ReturnType<typeof saveAnswer>>;
      try {
        r = await saveAnswer(runId, a.position, input);
      } catch {
        return offlinePath();
      }
      if (!r.ok) {
        if (r.network) return offlinePath();
        setMessage({ text: r.message, error: true });
        return;
      }
      afterSave({ ...a, ...r.answer }, advance);
    });
  };
  const commentInput = () => (comment.trim() ? comment.trim() : null);
  const choose = (value: AnswerValue) => {
    if (a.kind === 'number' && value !== 'na') return;
    persist({ value, comment: commentInput() }, value !== 'non_conform');
  };
  const saveNumber = () => {
    const n = Number(number.replace(',', '.'));
    if (!number.trim() || !Number.isFinite(n)) {
      setMessage({ text: 'Informe o valor medido.', error: true });
      return;
    }
    persist({ number_value: n, comment: commentInput() }, true);
  };
  const saveComment = () => {
    if (!a.value) return;
    persist(a.kind === 'number' && a.value !== 'na' ? { number_value: a.number_value, comment: commentInput() } : { value: a.value, comment: commentInput() }, true);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    setUploading(true);
    const position = a.position;
    try {
      const data = await resizeImage(file, 1600, 0.8);
      const offlinePath = async () => {
        if (await queueOp({ kind: 'photo', runId, position, image: data, at: new Date().toISOString() })) {
          merge({ position, has_photo: true });
          setLocalPhotos((m) => ({ ...m, [position]: data }));
          setMessage({ text: 'Foto guardada no aparelho; será enviada quando a internet voltar.' });
        } else setMessage({ text: 'Sem conexão. Tente de novo quando a internet voltar.', error: true });
      };
      if (isOffline() || queued > 0) {
        await offlinePath();
        void sync();
        return;
      }
      let r: Awaited<ReturnType<typeof saveAnswerPhoto>>;
      try {
        r = await saveAnswerPhoto(runId, position, data);
      } catch {
        return await offlinePath();
      }
      if (!r.ok && r.network) return await offlinePath();
      if (!r.ok) setMessage({ text: r.message, error: true });
      else {
        merge({ position, has_photo: true });
        setLocalPhotos((m) => {
          const rest = { ...m };
          delete rest[position];
          return rest;
        });
        setPhotoV((v) => ({ ...v, [position]: (v[position] ?? 0) + 1 }));
        setMessage({ text: 'Foto salva.' });
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Não foi possível ler a foto.', error: true });
    } finally {
      setUploading(false);
    }
  };
  const complete = () =>
    startTransition(async () => {
      setMessage(null);
      const offlinePath = async () => {
        if (await queueOp({ kind: 'complete', runId, at: new Date().toISOString() })) {
          setCompletedLocally(true);
          setMessage({ text: 'Concluído no aparelho. O envio é automático quando a internet voltar; não feche o checklist antes disso.' });
        } else setMessage({ text: 'Sem conexão. Tente de novo quando a internet voltar.', error: true });
      };
      if (isOffline() || queued > 0) {
        await offlinePath();
        void sync();
        return;
      }
      let r: Awaited<ReturnType<typeof completeChecklist>>;
      try {
        r = await completeChecklist(runId);
      } catch {
        return offlinePath();
      }
      if (r.ok) router.refresh();
      else if (r.network) await offlinePath();
      else setMessage({ text: r.message, error: true });
    });

  /** Envia a fila em ordem. Para na primeira falha de rede; recusa definitiva descarta e avisa. */
  const sync = async () => {
    if (syncing.current || !offlineSupported() || isOffline()) return;
    syncing.current = true;
    try {
      const ops = await pendingOps(runId);
      let completed = false;
      for (const op of ops) {
        let r: { ok: true } | { ok: false; message: string; network?: boolean };
        try {
          r =
            op.kind === 'answer' ? await saveAnswer(runId, op.position, op.input)
              : op.kind === 'photo' ? await saveAnswerPhoto(runId, op.position, op.image)
                : await completeChecklist(runId);
        } catch {
          r = { ok: false, message: 'offline', network: true };
        }
        const outcome = outcomeOf(op, r);
        if (outcome === 'offline') break;
        if (op.id !== undefined) await remove(op.id);
        if (outcome === 'rejected' && !r.ok) setMessage({ text: `Uma alteração feita sem internet foi recusada: ${r.message}`, error: true });
        if (op.kind === 'complete' && outcome === 'sent') completed = true;
      }
      const left = (await pendingOps(runId)).length;
      setQueued(left);
      if (left === 0 && ops.length > 0) setMessage({ text: 'Alterações feitas sem internet enviadas.' });
      if (completed) router.refresh();
    } finally {
      syncing.current = false;
    }
  };

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const status = () => setOnline(navigator.onLine);
    status();
    if (offlineSupported()) {
      void pendingOps(runId).then((ops) => {
        setQueued(ops.length);
        if (ops.some((o) => o.kind === 'complete')) setCompletedLocally(true);
      });
    }
    const onOnline = () => {
      status();
      void sync();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', status);
    const timer = window.setInterval(() => void sync(), 15_000);
    void sync();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', status);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  const cancel = () => {
    if (!window.confirm('Cancelar este checklist? As respostas ficam guardadas, mas ele não conta como feito.')) return;
    startTransition(async () => {
      const r = await cancelChecklist(runId);
      if (r.ok) router.push(`/app/uan/unidades/${detail.unit.id}`);
      else setMessage({ text: r.message, error: true });
    });
  };

  const evidence = missingEvidence(a);
  const busy = pending || uploading;

  return (
    <div className="space-y-5">
      {far && (
        <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Checklist iniciado a {detail.run.geo_distance_m} m da unidade (raio de {detail.unit.geo_radius_m} m). O registro guarda essa distância.
        </p>
      )}

      {(!online || queued > 0) && (
        <p role="note" aria-label="Situação da conexão" className="flex items-start gap-2 rounded-xl border border-sky-600/40 bg-sky-50 p-3 text-sm text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">
          {online ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" /> : <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <span>
            {online ? 'Enviando o que foi feito sem internet…' : 'Sem conexão: as respostas ficam guardadas neste aparelho e são enviadas quando a internet voltar.'}
            {queued > 0 && <> <strong>{queued} alteração(ões) aguardando envio.</strong></>}
          </span>
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>{progress.answered} de {progress.total} respondidos</span>
          {progress.score !== null && <span className="text-muted-foreground">Conformidade parcial {progress.score.toLocaleString('pt-BR')}%</span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progresso do checklist" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.answered}>
          <div className="h-full bg-primary transition-all" style={{ width: `${(100 * progress.answered) / Math.max(1, progress.total)}%` }} />
        </div>
        <nav aria-label="Itens do checklist" className="flex flex-wrap gap-1">
          {answers.map((x, i) => (
            <button
              key={x.position} type="button" onClick={() => go(i)} aria-label={`Ir para o item ${x.position}`} aria-current={!reviewing && i === index ? 'step' : undefined}
              className={cn('size-7 rounded-md border text-xs font-medium', chipTone(x), !reviewing && i === index && 'ring-2 ring-ring ring-offset-1')}
            >
              {x.position}
            </button>
          ))}
        </nav>
      </div>

      {reviewing ? (
        <section aria-labelledby="revisao" className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 id="revisao" className="font-display text-xl font-semibold">Revisar e concluir</h2>
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-emerald-50 p-2 dark:bg-emerald-950/40"><dt className="text-muted-foreground">Conformes</dt><dd className="text-xl font-semibold">{progress.conform}</dd></div>
            <div className="rounded-xl bg-destructive/10 p-2"><dt className="text-muted-foreground">Não conformes</dt><dd className="text-xl font-semibold">{progress.nonConform}</dd></div>
            <div className="rounded-xl bg-muted p-2"><dt className="text-muted-foreground">Não se aplica</dt><dd className="text-xl font-semibold">{progress.na}</dd></div>
          </dl>
          {progress.score !== null && <p className="text-sm">Conformidade: <span className="font-semibold">{progress.score.toLocaleString('pt-BR')}%</span> dos itens aplicáveis.</p>}
          {progress.blocking.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">Falta resolver {progress.blocking.length} item(ns) antes de concluir:</p>
              <ul className="flex flex-wrap gap-2">
                {progress.blocking.map((p) => {
                  const x = answers.find((y) => y.position === p)!;
                  return (
                    <li key={p}>
                      <Button type="button" variant="outline" size="sm" onClick={() => goPosition(p)}>
                        Item {p}{x.value ? ' · falta foto ou comentário' : ' · sem resposta'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            answers.some((x) => x.critical && x.value === 'non_conform') && (
              <p className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" /> Itens críticos não conformes abrem não conformidades com prazo de 24 h.</p>
            )
          )}
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Assinatura de quem fez (opcional)</h3>
            {signed && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signatureUrl(runId, signV)} alt="Assinatura salva" className="h-24 rounded-lg border border-border bg-white object-contain" />
            )}
            <SignaturePad
              saving={signing}
              onSave={async (png) => {
                setSigning(true);
                setMessage(null);
                const r = await saveSignature(runId, png);
                setSigning(false);
                if (!r.ok) return setMessage({ text: r.message, error: true });
                setSigned(true);
                setSignV((v) => v + 1);
                setMessage({ text: 'Assinatura salva.' });
              }}
            />
          </div>
          <Button type="button" size="lg" className="h-12 w-full" disabled={busy || signing || completedLocally || progress.blocking.length > 0} onClick={complete}>
            {pending && <Loader2 className="size-4 animate-spin" />} Concluir checklist
          </Button>
        </section>
      ) : (
        <section aria-labelledby="item-atual" className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Item {a.position} de {answers.length}{a.section ? ` · ${a.section}` : ''}</p>
            <h2 id="item-atual" className="text-lg font-semibold leading-snug">{a.prompt}</h2>
            {a.critical && <Badge variant="destructive">Item crítico</Badge>}
            {a.help && <p className="text-sm text-muted-foreground">{a.help}</p>}
          </div>

          {a.kind === 'number' ? (
            <div className="space-y-3">
              <form
                aria-label="Valor medido"
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveNumber();
                }}
              >
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="ck-number">Valor medido{a.unit ? ` (${a.unit})` : ''}</Label>
                  <Input id="ck-number" inputMode="decimal" value={number} onChange={(e) => setNumber(e.target.value)} className="h-12 text-lg" autoComplete="off" />
                </div>
                <Button type="submit" size="lg" className="h-12" disabled={busy}>Salvar valor</Button>
              </form>
              <p className="text-sm text-muted-foreground">Esperado: {rangeLabel(a)}.</p>
              {a.value && a.value !== 'na' && (
                <p role="status" className={cn('text-sm font-medium', a.value === 'conform' ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
                  {a.value === 'conform' ? 'Dentro do limite.' : 'Fora do limite: registre o que foi feito.'}
                </p>
              )}
              <Button type="button" variant="outline" aria-pressed={a.value === 'na'} disabled={busy} onClick={() => choose('na')} className={CHOICES[2]!.tone}>
                <Minus className="size-4" /> Não se aplica
              </Button>
            </div>
          ) : (
            <div role="group" aria-label="Resposta" className="grid gap-2 sm:grid-cols-3">
              {CHOICES.map((c) => (
                <Button
                  key={c.value} type="button" variant="outline" size="lg" disabled={busy}
                  aria-pressed={a.value === c.value} onClick={() => choose(c.value)}
                  className={cn('h-14 text-base', c.tone)}
                >
                  <c.icon className="size-5" /> {ANSWER_LABEL[c.value]}
                </Button>
              ))}
            </div>
          )}

          {(a.value === 'non_conform' || a.comment) && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="ck-comment">O que foi encontrado e o que foi feito{needsEvidence(a) ? ' (obrigatório)' : ''}</Label>
                <textarea id="ck-comment" className={TEXTAREA} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
                <Button type="button" size="sm" variant="secondary" disabled={busy || (comment.trim() || null) === (a.comment ?? null)} onClick={saveComment}>Salvar comentário</Button>
              </div>
              {a.value === 'non_conform' && (
                <div className="space-y-2">
                  <Label htmlFor="ck-photo" className="flex items-center gap-2"><Camera className="size-4" aria-hidden="true" /> Foto da evidência{needsEvidence(a) ? ' (obrigatória)' : ''}</Label>
                  <input
                    id="ck-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy}
                    onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }}
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
                  />
                  {uploading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Enviando foto…</p>}
                  {a.has_photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={localPhotos[a.position] ?? photoUrl(runId, a.position, photoV[a.position] ?? 0)} alt={`Evidência do item ${a.position}`} className="max-h-48 rounded-lg border border-border object-contain" />
                  )}
                </div>
              )}
              {evidence && <p className="text-sm text-amber-700 dark:text-amber-400">Para concluir, falta {[evidence.photo && 'a foto', evidence.comment && 'o comentário'].filter(Boolean).join(' e ')}.</p>}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={index === 0} onClick={() => go(index - 1)}><ChevronLeft className="size-4" /> Anterior</Button>
            {index < answers.length - 1 ? (
              <Button type="button" variant="ghost" onClick={() => go(index + 1)}>Próximo <ChevronRight className="size-4" /></Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setReviewing(true)}>Revisar <ChevronRight className="size-4" /></Button>
            )}
          </div>
        </section>
      )}

      {message && <p role={message.error ? 'alert' : 'status'} className={cn('text-sm', message.error ? 'text-destructive' : 'text-muted-foreground')}>{message.text}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!reviewing && <Button type="button" variant="outline" onClick={() => setReviewing(true)}>Revisar e concluir</Button>}
        {detail.can_cancel && <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={cancel}>Cancelar checklist</Button>}
      </div>
    </div>
  );
}
