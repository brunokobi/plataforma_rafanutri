'use client';

import { CheckCircle2, FilePlus2, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { acknowledgeDocument, approveDocument, createDocument, createTraining, saveDraft } from '@/lib/uan/document-actions';
import {
  equipmentList,
  parseMarkdown,
  POP_TEMPLATES,
  renderTemplate,
  trainingOverdue,
  type DocDetail,
  type MdInline,
  type UnitDocuments,
  type UnitTrainings,
} from '@/lib/uan/documents';
import { localToday } from '@/lib/uan/costs';

const TEXTAREA = 'min-h-[24rem] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const day = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
type Msg = { text: string; error?: boolean } | null;

function Inline({ parts }: { parts: MdInline[] }) {
  return <>{parts.map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}</>;
}

/** Markdown simples renderizado sem HTML injetado. */
export function Markdown({ md }: { md: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {parseMarkdown(md).map((b, i) => {
        switch (b.kind) {
          case 'h1': return <h2 key={i} className="font-display text-2xl font-semibold"><Inline parts={b.inline} /></h2>;
          case 'h2': return <h3 key={i} className="pt-2 text-lg font-semibold"><Inline parts={b.inline} /></h3>;
          case 'h3': return <h4 key={i} className="font-semibold"><Inline parts={b.inline} /></h4>;
          case 'quote': return <blockquote key={i} className="border-l-4 border-amber-500/60 bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><Inline parts={b.inline} /></blockquote>;
          case 'ul': return <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><Inline parts={it} /></li>)}</ul>;
          case 'ol': return <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><Inline parts={it} /></li>)}</ol>;
          default: return <p key={i}><Inline parts={b.inline} /></p>;
        }
      })}
    </div>
  );
}

/** Documentos da unidade: pendências de ciência, lista e criação a partir dos modelos de POP. */
export function DocumentsList({ data }: { data: UnitDocuments }) {
  const router = useRouter();
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const existing = new Set(data.documents.map((d) => d.code).filter(Boolean));
  const missing = POP_TEMPLATES.filter((t) => !existing.has(t.code));
  const [today] = useState(() => localToday());
  const vars = {
    unidade: data.unit.name,
    endereco: [data.unit.address, data.unit.city, data.unit.state].filter(Boolean).join(', ') || '(informe o endereço da unidade)',
    cnpj: data.unit.cnpj ?? '',
    rt: data.technical_lead ?? '(defina o RT da unidade)',
    data: day(today),
    equipamentos: equipmentList(data.equipment),
  };
  const create = (code: string) => {
    const t = POP_TEMPLATES.find((x) => x.code === code)!;
    startTransition(async () => {
      setMessage(null);
      const r = await createDocument(data.unit.id, { title: t.title, kind: 'pop', code: t.code, body_md: renderTemplate(t.body, vars), review_every_months: 12 });
      if (!r.ok) return setMessage({ text: r.message, error: true });
      router.push(`/app/uan/documentos/${r.id}`);
    });
  };
  const pendingAck = data.documents.filter((d) => d.version_id && !d.acknowledged);

  return (
    <div className="space-y-6">
      {pendingAck.length > 0 && (
        <div role="note" aria-label="Ciência pendente" className="rounded-2xl border border-amber-500/50 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Leia e dê ciência antes de seguir:</p>
          <ul className="mt-1 list-disc pl-5">{pendingAck.map((d) => <li key={d.id}><Link href={`/app/uan/documentos/${d.id}`} className="underline">{d.title} (versão {d.version})</Link></li>)}</ul>
        </div>
      )}
      {data.documents.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum documento ainda.</p> : (
        <ul aria-label="Documentos da unidade" className="divide-y divide-border rounded-2xl border border-border bg-card">
          {data.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0">
                <Link href={`/app/uan/documentos/${d.id}`} className="font-medium hover:underline">{d.title}</Link>
                <span className="block text-xs text-muted-foreground">
                  {d.version ? `Versão ${d.version} aprovada em ${new Date(d.approved_at!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · revisar até ${day(d.next_review_on)}` : 'Sem versão aprovada'}
                  {d.version ? ` · ciência ${d.ack_count}/${data.team_size}` : ''}
                </span>
              </span>
              <span className="flex flex-wrap gap-1">
                {d.review_overdue && <Badge variant="destructive">Revisão vencida</Badge>}
                {d.has_draft && <Badge variant="secondary">Rascunho em edição</Badge>}
                {d.version && (d.acknowledged ? <Badge variant="outline"><CheckCircle2 className="size-3" /> Lido</Badge> : <Badge variant="secondary">Ciência pendente</Badge>)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.can_edit && missing.length > 0 && (
        <section aria-labelledby="modelos-pop" className="space-y-2">
          <h2 id="modelos-pop" className="font-semibold">POPs obrigatórios da RDC 216/2004</h2>
          <p className="text-sm text-muted-foreground">Os modelos já saem com os dados da unidade (nome, endereço, RT e equipamentos). Revise com a RT antes de aprovar.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {missing.map((t) => (
              <li key={t.code} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm">
                <span>{t.title}</span>
                <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={`Criar ${t.title}`} onClick={() => create(t.code)}><FilePlus2 className="size-4" /> Criar</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}
    </div>
  );
}

/** Documento: versão vigente com ciência; rascunho com editor e pré-visualização; aprovação; versões; quem já leu. */
export function DocumentView({ data }: { data: DocDetail }) {
  const router = useRouter();
  const base = data.draft?.body_md ?? data.current?.body_md ?? '';
  const [body, setBody] = useState(base);
  const [summary, setSummary] = useState(data.draft?.change_summary ?? '');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [editing, setEditing] = useState(Boolean(data.draft));
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done: string, after?: () => void) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage({ text: r.message ?? 'Não foi possível concluir.', error: true });
      setMessage({ text: done });
      after?.();
      router.refresh();
    });

  return (
    <div className="space-y-6">
      {data.current ? (
        <section aria-labelledby="vigente" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="vigente" className="font-semibold">Versão vigente: {data.current.version}</h2>
            <span className="text-xs text-muted-foreground">aprovada em {new Date(data.current.approved_at!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{data.current.approved_by_name ? ` por ${data.current.approved_by_name}` : ''} · revisar até {day(data.current.next_review_on)}</span>
          </div>
          <article className="rounded-2xl border border-border bg-card p-5"><Markdown md={data.current.body_md ?? ''} /></article>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" aria-hidden="true" /> Integridade (SHA-256): <code className="break-all">{data.current.content_hash}</code></p>
          {data.acknowledged ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" aria-hidden="true" /> Você já deu ciência desta versão.</p>
          ) : (
            <Button type="button" disabled={pending} onClick={() => run(() => acknowledgeDocument(data.document.id), 'Ciência registrada.')}>Li e estou ciente</Button>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Ainda sem versão aprovada.</p>
      )}

      {data.can_edit && !editing && (
        <Button type="button" variant="outline" onClick={() => setEditing(true)}>Editar (nova versão)</Button>
      )}
      {data.can_edit && editing && (
        <section aria-labelledby="rascunho" className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="rascunho" className="font-semibold">{data.draft ? `Rascunho da versão ${data.draft.version}` : 'Nova versão'}</h2>
            <div role="tablist" aria-label="Modo" className="flex gap-1">
              {(['edit', 'preview'] as const).map((t) => (
                <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={cn('rounded-md px-3 py-1 text-sm', tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  {t === 'edit' ? 'Editar' : 'Pré-visualizar'}
                </button>
              ))}
            </div>
          </div>
          {tab === 'edit' ? (
            <>
              <Label htmlFor="doc-body" className="sr-only">Texto do documento</Label>
              <textarea id="doc-body" className={TEXTAREA} value={body} onChange={(e) => setBody(e.target.value)} />
              <p className="text-xs text-muted-foreground"># Título · ## Seção · - item · 1. passo · **negrito** · &gt; aviso</p>
            </>
          ) : (
            <div className="rounded-xl border border-border p-4"><Markdown md={body} /></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="doc-summary">O que mudou</Label><Input id="doc-summary" maxLength={500} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => run(() => saveDraft(data.document.id, { body_md: body, change_summary: summary }), 'Rascunho salvo.')}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar rascunho</Button>
            {data.can_approve && (
              <Button type="button" variant="secondary" disabled={pending}
                onClick={() => { if (window.confirm('Aprovar esta versão? Depois de aprovada ela não muda, e a equipe precisa dar ciência.')) run(async () => { const s = await saveDraft(data.document.id, { body_md: body, change_summary: summary }); return s.ok ? approveDocument(data.document.id) : s; }, 'Versão aprovada.', () => setEditing(false)); }}>
                <CheckCircle2 className="size-4" /> Aprovar versão
              </Button>
            )}
          </div>
          {!data.can_approve && <p className="text-xs text-muted-foreground">Quem aprova é o RT da unidade ou o responsável pela empresa.</p>}
        </section>
      )}
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}

      {data.acks.length > 0 && (
        <section aria-labelledby="ciencia" className="space-y-2">
          <h2 id="ciencia" className="font-semibold">Ciência da equipe</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
            {data.acks.map((k) => (
              <li key={k.user_id} className="flex justify-between gap-2 p-2.5">
                <span>{k.name}</span>
                {k.acknowledged_at ? <span className="text-emerald-700 dark:text-emerald-400">Lido em {new Date(k.acknowledged_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span> : <span className="text-amber-700 dark:text-amber-400">Pendente</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.versions.length > 0 && (
        <section aria-labelledby="versoes" className="space-y-2">
          <h2 id="versoes" className="font-semibold">Versões</h2>
          <ul className="space-y-1 text-sm">
            {data.versions.map((v) => (
              <li key={v.id} className="text-muted-foreground">
                <span className="font-medium text-foreground">v{v.version}</span> · {v.status === 'approved' ? `aprovada em ${new Date(v.approved_at!).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'rascunho'}{v.change_summary ? ` — ${v.change_summary}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Treinamentos: registro com participantes e reciclagem pendente (sem treinamento há 12 meses). */
export function TrainingsView({ data }: { data: UnitTrainings }) {
  const router = useRouter();
  const [today] = useState(() => localToday());
  const [v, setV] = useState({ topic: '', held_on: today, hours: '', instructor: '', notes: '', attendee_ids: [] as string[], other: '' });
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const overdue = data.team.filter((m) => trainingOverdue(m.last_training_on, today));

  return (
    <div className="space-y-6">
      <section aria-labelledby="reciclagem" className="space-y-2">
        <h2 id="reciclagem" className="font-display text-xl font-semibold">Reciclagem pendente</h2>
        {overdue.length === 0 ? <p className="text-sm text-muted-foreground">Toda a equipe treinada nos últimos 12 meses.</p> : (
          <ul aria-label="Reciclagem pendente" className="divide-y divide-border rounded-2xl border border-amber-500/50 bg-amber-50 text-sm dark:bg-amber-950/30">
            {overdue.map((m) => <li key={m.user_id} className="flex justify-between gap-2 p-2.5"><span>{m.name}</span><span className="text-xs text-muted-foreground">{m.last_training_on ? `último em ${day(m.last_training_on)}` : 'nunca treinado'}</span></li>)}
          </ul>
        )}
      </section>

      {data.can_edit && (
        <form aria-label="Registrar treinamento" className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setMessage(null);
              const r = await createTraining(data.unit.id, { ...v, other_names: v.other.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean) });
              if (!r.ok) return setMessage({ text: r.message, error: true });
              setMessage({ text: 'Treinamento registrado.' });
              setV({ ...v, topic: '', hours: '', instructor: '', notes: '', attendee_ids: [], other: '' });
              router.refresh();
            });
          }}>
          <h2 className="font-semibold sm:col-span-2">Registrar treinamento</h2>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="tr-topic">Tema</Label><Input id="tr-topic" maxLength={200} value={v.topic} onChange={(e) => setV({ ...v, topic: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="tr-date">Data</Label><Input id="tr-date" type="date" value={v.held_on} onChange={(e) => setV({ ...v, held_on: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="tr-hours">Carga horária (h)</Label><Input id="tr-hours" inputMode="decimal" value={v.hours} onChange={(e) => setV({ ...v, hours: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="tr-inst">Instrutor</Label><Input id="tr-inst" maxLength={120} value={v.instructor} onChange={(e) => setV({ ...v, instructor: e.target.value })} /></div>
          <fieldset className="space-y-1 sm:col-span-2">
            <legend className="text-sm font-medium">Participantes da equipe</legend>
            {data.team.length === 0 ? <p className="text-xs text-muted-foreground">Ninguém na equipe da unidade.</p> : (
              <div className="grid gap-1 sm:grid-cols-2">{data.team.map((m) => <label key={m.user_id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.attendee_ids.includes(m.user_id)} onChange={(e) => setV({ ...v, attendee_ids: e.target.checked ? [...v.attendee_ids, m.user_id] : v.attendee_ids.filter((x) => x !== m.user_id) })} /> {m.name}</label>)}</div>
            )}
          </fieldset>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="tr-other">Outros participantes (sem conta, separados por vírgula)</Label><Input id="tr-other" value={v.other} onChange={(e) => setV({ ...v, other: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Registrar treinamento</Button></div>
          {message && <p role={message.error ? 'alert' : 'status'} className={`text-sm sm:col-span-2 ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>{message.text}</p>}
        </form>
      )}

      <section aria-labelledby="treinamentos" className="space-y-2">
        <h2 id="treinamentos" className="font-display text-xl font-semibold">Treinamentos realizados</h2>
        {data.trainings.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum treinamento registrado.</p> : (
          <ul aria-label="Treinamentos" className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
            {data.trainings.map((t) => (
              <li key={t.id} className="p-3">
                <p className="font-medium">{t.topic}</p>
                <p className="text-xs text-muted-foreground">{day(t.held_on)} · {t.hours.toLocaleString('pt-BR')} h{t.instructor ? ` · ${t.instructor}` : ''} · {t.attendees.length} participante(s): {t.attendees.join(', ')}</p>
                {t.attendees.length > 0 && <a href={`/app/uan/unidades/${data.unit.id}/treinamentos/${t.id}/certificado`} className="text-xs font-medium text-primary underline">Certificados (PDF)</a>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
