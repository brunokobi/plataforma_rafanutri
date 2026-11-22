'use client';

import { Loader2, Mail, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { saveNotificationSettings, sendTestNotification } from '@/lib/notifications/actions';
import {
  CHANNEL_LABEL, hoursLabel, kindLabel, REMINDER_HOURS, STATUS_LABEL,
  type NotificationLogItem, type NotificationOverview, type NotificationSettings,
} from '@/lib/notifications/types';

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export function NotificationSettingsView({ overview, log }: { overview: NotificationOverview; log: NotificationLogItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState<NotificationSettings>(overview.settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const edit = overview.can_edit;
  const sum = (channel: 'telegram' | 'email', status: string) => overview.stats.last30.filter((s) => s.channel === channel && s.status === status).reduce((a, s) => a + s.n, 0);

  const toggleHour = (h: number) => setForm((f) => {
    const on = f.reminder_hours.includes(h);
    const next = on ? f.reminder_hours.filter((x) => x !== h) : [...f.reminder_hours, h];
    return { ...f, reminder_hours: next.sort((a, b) => b - a) };
  });
  const save = () => {
    setMessage(null);
    setErrors({});
    startTransition(async () => {
      const r = await saveNotificationSettings({ ...form, reminder_note: form.reminder_note?.trim() || null });
      if (r.ok) {
        setMessage({ ok: true, text: 'Avisos salvos.' });
        router.refresh();
      } else {
        setErrors(r.fields ?? {});
        setMessage({ ok: false, text: r.message });
      }
    });
  };
  const test = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await sendTestNotification();
      setMessage(r.ok ? { ok: true, text: `Teste enviado para ${r.data?.email}. Deve chegar em até 1 minuto.` } : { ok: false, text: r.message });
      if (r.ok) setTimeout(() => router.refresh(), 5000);
    });
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="canais" className="grid gap-3 sm:grid-cols-2">
        <h2 id="canais" className="sr-only">Canais</h2>
        <div className="space-y-1 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Send className="size-4 text-[#229ED9]" aria-hidden="true" />
            <span className="font-medium">Telegram</span>
            {overview.telegram_ready ? <Badge>Ligado</Badge> : <Badge variant="outline">Aguardando o bot</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {overview.telegram_ready
              ? `${overview.stats.telegram_patients} ${overview.stats.telegram_patients === 1 ? 'paciente recebe' : 'pacientes recebem'} pelo Telegram${overview.telegram_bot ? ` (@${overview.telegram_bot})` : ''}.`
              : 'O bot da plataforma ainda não foi ligado. Enquanto isso, os avisos importantes vão por e-mail.'}
          </p>
          <p className="text-xs text-muted-foreground">30 dias: {sum('telegram', 'sent')} enviados · {sum('telegram', 'failed')} falhas</p>
        </div>
        <div className="space-y-1 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">E-mail</span>
            <Badge variant="secondary">Só o importante</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Para quem não ligou o Telegram, ou quando o Telegram falha.</p>
          <p className="text-xs text-muted-foreground">30 dias: {sum('email', 'sent')} enviados · {sum('email', 'failed')} falhas</p>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        Para ligar o Telegram de um paciente, abra a ficha dele e use o cartão <strong>Avisos</strong> (link ou QR code). O paciente também
        pode ativar sozinho na área do paciente.
      </p>

      <section aria-labelledby="o-que" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 id="o-que" className="font-semibold">O que enviar</h2>
        <fieldset disabled={!edit || pending} className="space-y-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 size-4 accent-primary" checked={form.scheduled_enabled} onChange={(e) => setForm({ ...form, scheduled_enabled: e.target.checked })} />
            <span><span className="font-medium">Consulta marcada, remarcada ou cancelada</span><br /><span className="text-sm text-muted-foreground">Sai assim que você mexe na agenda.</span></span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 size-4 accent-primary" checked={form.plan_enabled} onChange={(e) => setForm({ ...form, plan_enabled: e.target.checked })} />
            <span><span className="font-medium">Plano novo publicado</span><br /><span className="text-sm text-muted-foreground">Só para quem tem acesso à área do paciente. Vai apenas pelo Telegram.</span></span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 size-4 accent-primary" checked={form.reminders_enabled} onChange={(e) => setForm({ ...form, reminders_enabled: e.target.checked })} />
            <span><span className="font-medium">Lembretes antes da consulta</span><br /><span className="text-sm text-muted-foreground">O primeiro lembrete também vai por e-mail para quem não tem Telegram; os seguintes, só pelo Telegram.</span></span>
          </label>
          {form.reminders_enabled && (
            <div className="space-y-2 pl-7">
              <p className="text-sm font-medium" id="horas">Quando lembrar (até 3)</p>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="horas">
                {REMINDER_HOURS.map((h) => {
                  const on = form.reminder_hours.includes(h);
                  return (
                    <button key={h} type="button" aria-pressed={on} onClick={() => toggleHour(h)} disabled={!on && form.reminder_hours.length >= 3}
                      className={`min-h-9 rounded-full border px-3 text-sm transition-colors disabled:opacity-40 ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>
                      {hoursLabel(h)}
                    </button>
                  );
                })}
              </div>
              {errors.reminder_hours && <p className="text-sm text-destructive">{errors.reminder_hours}</p>}
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="nota">Recado junto do lembrete (opcional)</Label>
                <textarea id="nota" maxLength={300} rows={2} value={form.reminder_note ?? ''} onChange={(e) => setForm({ ...form, reminder_note: e.target.value })}
                  placeholder="Ex.: Traga seus exames recentes e venha com roupa leve para a avaliação."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                {errors.reminder_note && <p className="text-sm text-destructive">{errors.reminder_note}</p>}
              </div>
            </div>
          )}
        </fieldset>
        {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-primary' : 'text-destructive'}`}>{message.text}</p>}
        <div className="flex flex-wrap gap-2">
          {edit ? (
            <>
              <Button type="button" onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
              <Button type="button" variant="outline" onClick={test} disabled={pending}>Enviar teste para o meu e-mail</Button>
            </>
          ) : <p className="text-sm text-muted-foreground">Só owner ou nutricionista muda os avisos.</p>}
        </div>
      </section>

      {edit && (
        <section aria-labelledby="historico" className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h2 id="historico" className="font-semibold">Últimos avisos</h2>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aviso enviado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Quando</th><th className="py-2 pr-3 font-medium">Paciente</th><th className="py-2 pr-3 font-medium">Aviso</th>
                    <th className="py-2 pr-3 font-medium">Canal</th><th className="py-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((n) => (
                    <tr key={n.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{when(n.sent_at ?? n.date_created)}</td>
                      <td className="py-2 pr-3">{n.patient_id ? <Link href={`/app/pacientes/${n.patient_id}`} className="hover:underline">{n.patient_name}</Link> : '—'}</td>
                      <td className="py-2 pr-3">{kindLabel(n.kind)}</td>
                      <td className="py-2 pr-3">{CHANNEL_LABEL[n.channel]}</td>
                      <td className="py-2" title={n.last_error ?? undefined}>
                        <span className={n.status === 'failed' ? 'text-destructive' : n.status === 'sent' ? '' : 'text-muted-foreground'}>{STATUS_LABEL[n.status]}</span>
                        {n.last_error && n.status !== 'sent' && <span className="block text-xs text-muted-foreground">{n.last_error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
