'use client';

import { Check, ClipboardCopy, ExternalLink, Loader2, MessageCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { QuestionnaireAnswers } from '@/components/forms/questionnaire-fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cancelAnamnesis, reviewAnamnesis, sendAnamnesis } from '@/lib/anamneses/actions';
import type { Anamnesis, AnamnesisStatus } from '@/lib/anamneses/repository';
import { cn } from '@/lib/utils';

const STATUS: Record<AnamnesisStatus, string> = { sent: 'Aguardando resposta', answered: 'Respondida', reviewed: 'Revisada', cancelled: 'Cancelada' };
const dateBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : '—';

export interface TemplateOption {
  id: string;
  name: string;
  own: boolean;
}

/** Mensagem pronta para o WhatsApp (wa.me abre o app com o texto; o número é escolhido lá ou vem do cadastro). */
export function whatsappLink(phoneE164: string | null, firstName: string, link: string): string {
  const text = `Olá, ${firstName}! Antes da nossa consulta, responda este questionário (leva poucos minutos): ${link}`;
  const phone = phoneE164 ? phoneE164.replace(/\D/g, '') : '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function PatientAnamneses({
  patientId,
  patientFirstName,
  patientPhone,
  archived,
  anamneses,
  templates,
}: {
  patientId: string;
  patientFirstName: string;
  patientPhone: string | null;
  archived: boolean;
  anamneses: Anamnesis[] | null;
  templates: TemplateOption[] | null;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates?.[0]?.id ?? '');
  const [days, setDays] = useState(7);
  const [sent, setSent] = useState<{ link: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(anamneses?.find((a) => a.status === 'answered')?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setMessage(null);
    setSent(null);
    setCopied(false);
    startTransition(async () => {
      const r = await sendAnamnesis(patientId, templateId, days);
      if (r.ok) {
        setSent({ link: r.link, expiresAt: r.expiresAt });
        router.refresh();
      } else setMessage({ kind: 'error', text: r.message });
    });
  }

  function change(a: Anamnesis, to: 'reviewed' | 'cancelled') {
    setBusy(a.id);
    setMessage(null);
    startTransition(async () => {
      const r = to === 'reviewed' ? await reviewAnamnesis(a.id, patientId) : await cancelAnamnesis(a.id, patientId);
      setBusy(null);
      setMessage(r.ok ? { kind: 'ok', text: to === 'reviewed' ? 'Anamnese marcada como revisada.' : 'Link cancelado: o paciente não consegue mais responder.' } : { kind: 'error', text: r.message });
      if (r.ok) router.refresh();
    });
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="enviar-anamnese" className="rounded-2xl border border-border bg-card p-5">
        <h2 id="enviar-anamnese" className="font-display text-xl font-semibold">Enviar anamnese</h2>
        <p className="mt-1 text-sm text-muted-foreground">O paciente responde pelo celular, sem precisar de conta. O link vale só para esta anamnese.</p>
        {archived ? (
          <p className="mt-4 text-sm text-muted-foreground">Reative o paciente para enviar anamneses.</p>
        ) : templates === null || templates.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhum questionário disponível. <Link href="/app/questionarios" className="font-medium text-primary hover:underline">Ver questionários</Link>
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-1.5">
              <Label htmlFor="an-template">Questionário</Label>
              <select id="an-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.own ? '' : ' (padrão)'}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="an-days">Validade</Label>
              <select id="an-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                {[3, 7, 14, 30].map((d) => (
                  <option key={d} value={d}>{d} dias</option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={send} disabled={pending || !templateId}>
              {pending && !busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Gerar link
            </Button>
          </div>
        )}

        {sent && (
          <div className="mt-5 space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4" role="status">
            <p className="text-sm font-medium">Link pronto (vale até {dateBR(sent.expiresAt)}). Ele só aparece agora: copie ou envie.</p>
            <input readOnly value={sent.link} aria-label="Link da anamnese" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => copy(sent.link)}>
                {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? 'Copiado' : 'Copiar link'}
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={whatsappLink(patientPhone, patientFirstName, sent.link)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" /> Enviar por WhatsApp
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href={sent.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" /> Preencher agora com o paciente
                </a>
              </Button>
            </div>
          </div>
        )}
      </section>

      {message && (
        <p role="status" className={cn('text-sm', message.kind === 'ok' ? 'text-primary' : 'text-destructive')}>{message.text}</p>
      )}

      <section aria-labelledby="anamneses-enviadas">
        <h2 id="anamneses-enviadas" className="font-display text-xl font-semibold">Anamneses</h2>
        {anamneses === null ? (
          <p className="mt-3 text-sm text-destructive">Não foi possível carregar as anamneses agora.</p>
        ) : anamneses.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma anamnese enviada ainda.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {anamneses.map((a) => {
              const open = openId === a.id;
              const hasAnswers = a.status === 'answered' || a.status === 'reviewed';
              const expired = a.status === 'sent' && a.token_expires_at !== null && new Date(a.token_expires_at) <= new Date();
              return (
                <li key={a.id} className="rounded-2xl border border-border bg-card">
                  <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.title ?? 'Anamnese'}</p>
                      <p className="text-sm text-muted-foreground">
                        Enviada em {dateBR(a.date_created)}
                        {a.answered_at ? ` · respondida em ${dateBR(a.answered_at)}` : a.status === 'sent' ? ` · link ${expired ? 'expirou' : 'vale até'} ${dateBR(a.token_expires_at)}` : ''}
                      </p>
                    </div>
                    <Badge variant={a.status === 'answered' ? 'default' : 'secondary'}>{expired ? 'Link expirado' : STATUS[a.status]}</Badge>
                    {hasAnswers && (
                      <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpenId(open ? null : a.id)}>
                        {open ? 'Ocultar respostas' : 'Ver respostas'}
                      </Button>
                    )}
                    {a.status === 'answered' && (
                      <Button type="button" size="sm" disabled={busy === a.id} onClick={() => change(a, 'reviewed')}>
                        {busy === a.id && <Loader2 className="size-4 animate-spin" />} Marcar como revisada
                      </Button>
                    )}
                    {a.status === 'sent' && (
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={busy === a.id} onClick={() => change(a, 'cancelled')}>
                        {busy === a.id && <Loader2 className="size-4 animate-spin" />} Cancelar link
                      </Button>
                    )}
                  </div>
                  {open && hasAnswers && (
                    <div className="border-t border-border px-5 py-4">
                      <QuestionnaireAnswers schema={a.schema_snapshot} answers={a.answers} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
