'use client';

import { Check, ClipboardCopy, ExternalLink, Loader2, Mail, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  createMyTelegramLink, createPatientTelegramLink, saveMyContactPrefs, savePatientContactPrefs, unlinkMyTelegram, unlinkPatientTelegram,
} from '@/lib/notifications/actions';
import { CHANNEL_LABEL, kindLabel, STATUS_LABEL, type ContactPrefs } from '@/lib/notifications/types';

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/**
 * Canais de aviso de um paciente. `mode="patient"`: o próprio paciente, na área dele (abre o Telegram
 * direto). `mode="professional"`: a nutricionista gera o link e manda para o paciente (ou mostra o QR na consulta).
 */
export function ContactPrefsPanel({ mode, patientId = null, context = null, prefs, firstName }: {
  mode: 'patient' | 'professional';
  patientId?: string | null;
  context?: string | null;
  prefs: ContactPrefs;
  firstName?: string;
}) {
  const router = useRouter();
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const who = mode === 'patient' ? 'você' : firstName ?? 'o paciente';
  // Mudança aparece na hora; volta ao valor do servidor se a gravação falhar.
  const [local, setLocal] = useState<{ email_opt_in?: boolean; telegram_opt_in?: boolean }>({});
  const emailOn = local.email_opt_in ?? prefs.email_opt_in;
  const telegramOptIn = local.telegram_opt_in ?? prefs.telegram_opt_in;

  const save = (patch: { email_opt_in?: boolean; telegram_opt_in?: boolean }) => {
    setMessage(null);
    setLocal((l) => ({ ...l, ...patch }));
    startTransition(async () => {
      const r = mode === 'patient' ? await saveMyContactPrefs(context, patch) : await savePatientContactPrefs(patientId!, patch);
      if (r.ok) router.refresh();
      else {
        setLocal({});
        setMessage(r.message);
      }
    });
  };
  const generate = () => {
    setMessage(null);
    startTransition(async () => {
      const r = mode === 'patient' ? await createMyTelegramLink(context) : await createPatientTelegramLink(patientId!);
      if (r.ok && r.data) {
        setLink(r.data);
        setQr(await QRCode.toDataURL(r.data.url, { margin: 1, width: 220, errorCorrectionLevel: 'M' }).catch(() => null));
        if (mode === 'patient') window.open(r.data.url, '_blank', 'noopener');
      } else if (!r.ok) setMessage(r.message);
    });
  };
  const unlink = () => {
    if (!window.confirm(mode === 'patient' ? 'Desligar os avisos pelo Telegram?' : `Desligar o Telegram de ${who}? Os avisos importantes passam a ir por e-mail.`)) return;
    setMessage(null);
    startTransition(async () => {
      const r = mode === 'patient' ? await unlinkMyTelegram(context) : await unlinkPatientTelegram(patientId!);
      if (r.ok) {
        setLink(null);
        setQr(null);
        router.refresh();
      } else setMessage(r.message);
    });
  };

  const telegramOn = prefs.telegram_linked && telegramOptIn;

  return (
    <div className="space-y-4">
      {/* Telegram */}
      <div className="space-y-3 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Send className="size-4 text-[#229ED9]" aria-hidden="true" />
          <h3 className="font-medium">Telegram</h3>
          {telegramOn ? <Badge>Ligado</Badge> : prefs.telegram_linked ? <Badge variant="secondary">Pausado</Badge> : <Badge variant="outline">Desligado</Badge>}
          <span className="text-xs text-muted-foreground">gratuito · todos os avisos</span>
        </div>
        {prefs.telegram_linked ? (
          <>
            <p className="text-sm text-muted-foreground">
              {mode === 'patient' ? 'Seus avisos' : `Os avisos de ${who}`} chegam no Telegram{prefs.telegram_name ? ` de ${prefs.telegram_name}` : ''}
              {prefs.telegram_linked_at ? `, ligado em ${when(prefs.telegram_linked_at)}` : ''}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save({ telegram_opt_in: !telegramOptIn })}>
                {telegramOptIn ? 'Pausar avisos no Telegram' : 'Retomar avisos no Telegram'}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={unlink}>Desligar</Button>
            </div>
          </>
        ) : !prefs.telegram_ready ? (
          <p className="text-sm text-muted-foreground">O Telegram ainda não foi ligado na plataforma. Enquanto isso, os avisos importantes vão por e-mail.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {mode === 'patient'
                ? 'Receba lembretes de consulta, mudanças de horário e plano novo direto no Telegram, na hora e sem custo. Toque no botão, abra o Telegram e toque em "Iniciar".'
                : `Gere o link e envie para ${who} (ou mostre o QR na consulta). Ao abrir e tocar em "Iniciar" no Telegram, todos os avisos passam a chegar por lá.`}
            </p>
            <Button type="button" size="sm" onClick={generate} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {mode === 'patient' ? 'Ativar no Telegram' : 'Gerar link do Telegram'}
            </Button>
            {link && (
              <div className="flex flex-wrap items-start gap-4 rounded-lg bg-muted/50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado no navegador (data URL) */}
                {qr && <img src={qr} alt="QR code para ativar os avisos no Telegram" className="size-36 rounded-md bg-white p-1" />}
                <div className="min-w-56 flex-1 space-y-2">
                  <input readOnly value={link.url} aria-label="Link do Telegram" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={async () => {
                      try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setCopied(false); }
                    }}>
                      {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? 'Copiado' : 'Copiar link'}
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /> Abrir no Telegram</a>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Vale 7 dias e uma única vez. Depois de tocar em &quot;Iniciar&quot;, atualize esta página.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* E-mail */}
      <div className="space-y-2 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="font-medium">E-mail</h3>
          <span className="text-xs text-muted-foreground">só o importante, quando o Telegram não está ligado</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {prefs.email
            ? `Convite, consulta marcada, remarcada ou cancelada e o primeiro lembrete vão para ${prefs.email}.`
            : mode === 'patient' ? 'Seu consultório não tem um e-mail seu no cadastro.' : `Sem e-mail no cadastro de ${who}: cadastre um para os avisos importantes.`}
        </p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={emailOn} disabled={pending} onChange={(e) => save({ email_opt_in: e.target.checked })} />
          Receber os avisos importantes por e-mail
        </label>
      </div>

      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}

      {prefs.recent && prefs.recent.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Últimos avisos</h3>
          <ul className="divide-y divide-border text-sm">
            {prefs.recent.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{kindLabel(n.kind)} · <span className="text-muted-foreground">{CHANNEL_LABEL[n.channel]}</span></span>
                <span className="text-xs text-muted-foreground" title={n.last_error ?? undefined}>{STATUS_LABEL[n.status]} · {when(n.sent_at ?? n.date_created)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
