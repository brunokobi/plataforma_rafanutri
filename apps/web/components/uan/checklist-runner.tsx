'use client';

import { AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, Loader2, MapPin, Minus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { resizeImage } from '@/lib/recipes/resize-image';
import { cancelChecklist, completeChecklist, saveAnswer, saveAnswerPhoto } from '@/lib/uan/checklist-actions';
import {
  ANSWER_LABEL,
  missingEvidence,
  needsEvidence,
  nextPending,
  outsideRadius,
  photoUrl,
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

  const persist = (input: { value?: AnswerValue; number_value?: number | null; comment?: string | null }, advance: boolean) => {
    setMessage(null);
    startTransition(async () => {
      const r = await saveAnswer(runId, a.position, input);
      if (!r.ok) {
        setMessage({ text: r.message, error: true });
        return;
      }
      const updated = { ...a, ...r.answer };
      merge(updated);
      // Avança sozinho quando o item está completo (sem evidência pendente).
      if (advance && !missingEvidence(updated)) {
        const list = answers.map((x) => (x.position === updated.position ? updated : x));
        const nextPos = nextPending(list, updated.position);
        if (nextPos === null) setReviewing(true);
        else goPosition(nextPos);
      }
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
    try {
      const data = await resizeImage(file, 1600, 0.8);
      const r = await saveAnswerPhoto(runId, a.position, data);
      if (!r.ok) setMessage({ text: r.message, error: true });
      else {
        merge({ position: a.position, has_photo: true });
        setPhotoV((v) => ({ ...v, [a.position]: (v[a.position] ?? 0) + 1 }));
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
      const r = await completeChecklist(runId);
      if (r.ok) router.refresh();
      else setMessage({ text: r.message, error: true });
    });
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
          <Button type="button" size="lg" className="h-12 w-full" disabled={busy || progress.blocking.length > 0} onClick={complete}>
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
                    <img src={photoUrl(runId, a.position, photoV[a.position] ?? 0)} alt={`Evidência do item ${a.position}`} className="max-h-48 rounded-lg border border-border object-contain" />
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
