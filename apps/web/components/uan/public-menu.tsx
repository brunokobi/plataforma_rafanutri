'use client';

import { CheckCircle2, Copy, Loader2, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ALLERGEN_LABEL } from '@/lib/uan/catalog';
import { SLOT_LABEL } from '@/lib/uan/menus';
import { saveSurvey, sendSatisfaction, setPublicMenu } from '@/lib/uan/public-menu-actions';
import { answersComplete, DEFAULT_QUESTIONS, type PublicDish, type PublicMenuSettings, type PublicSurvey, type SurveyQuestion } from '@/lib/uan/public-menu';

const num = (v: number | null, unit: string) => (v === null ? null : `${v.toLocaleString('pt-BR', { maximumFractionDigits: v >= 10 ? 0 : 1 })} ${unit}`);

/** Id do aparelho (antispam da pesquisa), guardado no navegador. */
function deviceId(): string {
  try {
    const k = 'rafanutri-device';
    const v = localStorage.getItem(k);
    if (v && /^[0-9a-f-]{36}$/i.test(v)) return v;
    const n = crypto.randomUUID();
    localStorage.setItem(k, n);
    return n;
  } catch {
    return crypto.randomUUID();
  }
}

function Stars({ value, onChange, label }: { value: number | null; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="rounded p-1 focus-visible:ring-2 focus-visible:ring-ring">
          <Star className={`size-7 ${value !== null && n <= value ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground'}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** Avaliação curta de um prato (ou da refeição): perguntas da pesquisa + comentário opcional. */
export function RateDish({ token, survey, dish, servedOn }: { token: string; survey: PublicSurvey; dish: PublicDish | null; servedOn: string }) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Array<number | boolean | null>>(survey.questions.map(() => null));
  const [comment, setComment] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const what = dish ? dish.name : 'a refeição';
  if (done) return <p role="status" className="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden="true" /> {done}</p>;
  if (!open) return <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Avaliar {dish ? 'prato' : 'refeição'}</Button>;
  return (
    <form aria-label={`Avaliar ${what}`} className="space-y-3 rounded-xl border border-border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!answersComplete(survey.questions, answers)) return setError('Responda todas as perguntas.');
        startTransition(async () => {
          setError(null);
          const r = await sendSatisfaction(token, { served_on: servedOn, sheet_root_id: dish?.sheet_root_id ?? null, device_id: deviceId(), answers: answers as Array<number | boolean>, comment });
          if (!r.ok) return setError(r.message);
          setDone('Obrigado pela avaliação!');
        });
      }}>
      {survey.questions.map((q, i) => (
        <div key={i} className="space-y-1">
          <p className="text-sm font-medium">{q.text}</p>
          {q.kind === 'stars' ? (
            <Stars label={q.text} value={typeof answers[i] === 'number' ? (answers[i] as number) : null} onChange={(n) => setAnswers(answers.map((a, j) => (j === i ? n : a)))} />
          ) : (
            <div role="group" aria-label={q.text} className="flex gap-2">
              {[true, false].map((v) => <Button key={String(v)} type="button" size="sm" variant={answers[i] === v ? 'default' : 'outline'} aria-pressed={answers[i] === v} onClick={() => setAnswers(answers.map((a, j) => (j === i ? v : a)))}>{v ? 'Sim' : 'Não'}</Button>)}
            </div>
          )}
        </div>
      ))}
      <div className="space-y-1"><Label htmlFor={`cm-${dish?.sheet_root_id ?? 'geral'}`}>Comentário (opcional)</Label><Input id={`cm-${dish?.sheet_root_id ?? 'geral'}`} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Enviar</Button>
    </form>
  );
}

/** Um prato no cardápio público: nome, posição, alergênicos e nutrientes por porção. */
export function DishCard({ dish, children, big = false }: { dish: PublicDish; children?: React.ReactNode; big?: boolean }) {
  const n = dish.nutrients;
  const facts = [num(n.energy_kcal, 'kcal'), n.protein_g !== null && `proteínas ${num(n.protein_g, 'g')}`, n.carbohydrate_g !== null && `carboidratos ${num(n.carbohydrate_g, 'g')}`, n.sodium_mg !== null && `sódio ${num(n.sodium_mg, 'mg')}`].filter(Boolean);
  return (
    <li className={big ? 'space-y-1 py-3' : 'space-y-2 rounded-2xl border border-border bg-card p-4'}>
      <p className={big ? 'text-sm uppercase tracking-wide text-muted-foreground' : 'text-xs uppercase tracking-wide text-muted-foreground'}>{SLOT_LABEL[dish.slot]}</p>
      <p className={big ? 'text-4xl font-semibold' : 'text-lg font-semibold'}>{dish.name}</p>
      {dish.allergens.length > 0 && (
        <p className="flex flex-wrap items-center gap-1" aria-label="Alergênicos">
          <span className={big ? 'text-xl font-semibold text-amber-600' : 'text-xs font-semibold text-amber-700 dark:text-amber-400'}>Contém:</span>
          {dish.allergens.map((a) => <Badge key={a} variant="secondary" className={big ? 'text-lg' : ''}>{ALLERGEN_LABEL[a]}</Badge>)}
        </p>
      )}
      {facts.length > 0 && <p className={big ? 'text-xl text-muted-foreground' : 'text-xs text-muted-foreground'}>Por porção: {facts.join(' · ')}</p>}
      {children}
    </li>
  );
}

/** Configuração da unidade: publicar o cardápio (link e QR), pesquisa e resultados por prato. */
export function PublicMenuSettingsView({ data, origin, qrSvg }: { data: PublicMenuSettings; origin: string; qrSvg: string | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(data.survey?.title ?? 'Como foi a sua refeição?');
  const [questions, setQuestions] = useState<SurveyQuestion[]>(data.survey?.questions ?? DEFAULT_QUESTIONS);
  const [perDish, setPerDish] = useState(data.survey?.per_dish ?? true);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const url = data.token ? `${origin}/cardapio/${data.token}` : null;
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage({ text: r.message ?? 'Não foi possível salvar.', error: true });
      setMessage({ text: done });
      router.refresh();
    });

  return (
    <div className="space-y-8">
      <section aria-labelledby="publicar" className="space-y-3">
        <h2 id="publicar" className="font-display text-xl font-semibold">Cardápio público</h2>
        <p className="text-sm text-muted-foreground">O comensal vê os pratos do dia e da semana com alergênicos e nutrientes por porção, sem custo nem fornecedor. Só entram cardápios aprovados.</p>
        {data.enabled && url ? (
          <div className="flex flex-wrap items-start gap-6">
            {qrSvg && <div className="size-40 rounded-xl border border-border bg-white p-2" aria-label="QR Code do cardápio" role="img" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
            <div className="min-w-0 space-y-2 text-sm">
              <p className="break-all"><a href={url} target="_blank" rel="noreferrer" className="font-medium text-primary underline">{url}</a></p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(url)}><Copy className="size-4" /> Copiar link</Button>
                <Button asChild size="sm" variant="outline"><a href={`${url}/tv`} target="_blank" rel="noreferrer">Modo TV</a></Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { if (window.confirm('Trocar o link? O QR Code impresso deixa de funcionar.')) run(() => setPublicMenu(data.unit.id, true, true), 'Link trocado.'); }}>Trocar link</Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setPublicMenu(data.unit.id, false), 'Cardápio despublicado.')}>Despublicar</Button>
              </div>
            </div>
          </div>
        ) : (
          <Button type="button" disabled={pending || !data.unit.active} onClick={() => run(() => setPublicMenu(data.unit.id, true), 'Cardápio publicado.')}>Publicar cardápio</Button>
        )}
      </section>

      <section aria-labelledby="pesquisa" className="space-y-3">
        <h2 id="pesquisa" className="font-display text-xl font-semibold">Pesquisa de satisfação</h2>
        <form aria-label="Pesquisa de satisfação" className="space-y-3 rounded-2xl border border-border bg-card p-4"
          onSubmit={(e) => { e.preventDefault(); run(() => saveSurvey(data.unit.id, { title, questions, per_dish: perDish }), data.survey ? 'Nova pesquisa aberta.' : 'Pesquisa aberta.'); }}>
          <div className="space-y-1.5"><Label htmlFor="sv-title">Título</Label><Input id="sv-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          {questions.map((q, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
              <Input aria-label={`Pergunta ${i + 1}`} maxLength={160} value={q.text} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <select aria-label={`Tipo da pergunta ${i + 1}`} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={q.kind} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, kind: e.target.value as SurveyQuestion['kind'] } : x)))}>
                <option value="stars">Estrelas (1 a 5)</option><option value="yes_no">Sim ou não</option>
              </select>
              <Button type="button" variant="ghost" size="sm" disabled={questions.length === 1} onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remover</Button>
            </div>
          ))}
          {questions.length < 3 && <Button type="button" variant="outline" size="sm" onClick={() => setQuestions([...questions, { text: '', kind: 'stars' }])}>Adicionar pergunta</Button>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={perDish} onChange={(e) => setPerDish(e.target.checked)} /> Avaliar cada prato (senão, a refeição inteira)</label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>{data.survey ? 'Salvar como nova pesquisa' : 'Abrir pesquisa'}</Button>
            {data.survey && <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => saveSurvey(data.unit.id, { close: true }), 'Pesquisa encerrada.')}>Encerrar pesquisa</Button>}
          </div>
          <p className="text-xs text-muted-foreground">Uma resposta por aparelho, dia e prato. Mudar as perguntas abre uma pesquisa nova (as respostas antigas ficam).</p>
        </form>
      </section>
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}

      <section aria-labelledby="resultados" className="space-y-3">
        <h2 id="resultados" className="font-display text-xl font-semibold">Resultado por prato (30 dias)</h2>
        {data.results.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p> : (
          <table className="w-full text-sm" aria-label="Satisfação por prato">
            <thead><tr className="border-b border-border text-left"><th className="py-2">Prato</th><th className="py-2 text-right">Nota média</th><th className="py-2 text-right">Respostas</th><th className="py-2 text-right">Comentários</th></tr></thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={r.sheet_root_id ?? 'geral'} className="border-b border-border/60">
                  <td className="py-2">{r.name}</td>
                  <td className={`py-2 text-right font-medium ${r.avg_rating !== null && r.avg_rating < 3 ? 'text-destructive' : ''}`}>{r.avg_rating === null ? '—' : r.avg_rating.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                  <td className="py-2 text-right">{r.responses}</td>
                  <td className="py-2 text-right">{r.comments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data.comments.length > 0 && (
          <ul aria-label="Comentários recentes" className="space-y-1 text-sm">
            {data.comments.map((c, i) => <li key={i}><span className="text-muted-foreground">{c.served_on.split('-').reverse().join('/')}{c.dish ? ` · ${c.dish}` : ''}{c.rating ? ` · ${c.rating}★` : ''}:</span> {c.comment}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
