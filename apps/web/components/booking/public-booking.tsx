'use client';

import { CalendarCheck, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { bookPublic, getPublicSlots } from '@/lib/booking/actions';
import { dayLabel, whenLabel, type PublicSlots } from '@/lib/booking/types';
import { cn } from '@/lib/utils';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** RN-068 — Escolha do horário e pedido de agendamento na página pública. */
export function PublicBooking({ slug, initial, today, inPerson, online, requireApproval, color }: {
  slug: string; initial: PublicSlots; today: string; inPerson: boolean; online: boolean; requireApproval: boolean; color: string;
}) {
  const [slots, setSlots] = useState(initial);
  const [chosen, setChosen] = useState<string | null>(null);
  const [mode, setMode] = useState<'in_person' | 'online'>(inPerson ? 'in_person' : 'online');
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', message: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { status: 'pending' | 'confirmed'; when: string }>(null);
  const [pending, start] = useTransition();
  const hasAny = slots.days.some((d) => d.slots.length > 0);

  function go(delta: number) {
    const from = addDays(slots.from, delta * 7);
    if (from < today) return;
    start(async () => {
      const r = await getPublicSlots(slug, from);
      if (r) { setSlots(r); setChosen(null); }
    });
  }

  if (done) {
    return (
      <div role="status" className="space-y-2 rounded-2xl border border-border bg-card p-6 text-center">
        <CalendarCheck className="mx-auto size-10" style={{ color }} aria-hidden="true" />
        <p className="font-display text-xl font-semibold">{done.status === 'confirmed' ? 'Consulta marcada!' : 'Pedido enviado!'}</p>
        <p className="text-muted-foreground">
          {whenLabel(done.when)}.{' '}
          {done.status === 'confirmed' ? 'O consultório vai entrar em contato com os detalhes.' : 'O consultório confirma o horário e entra em contato pelo telefone ou e-mail informado.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending || slots.from <= today} onClick={() => go(-1)} aria-label="Semana anterior"><ChevronLeft className="size-4" /></Button>
        <p className="text-sm font-medium">{pending ? <Loader2 className="inline size-4 animate-spin" /> : `A partir de ${dayLabel(slots.from)}`}</p>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => go(1)} aria-label="Próxima semana"><ChevronRight className="size-4" /></Button>
      </div>
      {!hasAny ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sem horários livres nesta semana. Veja a próxima.</p>
      ) : (
        <div className="space-y-3" role="group" aria-label="Horários livres">
          {slots.days.filter((d) => d.slots.length > 0).map((d) => (
            <div key={d.date}>
              <p className="mb-1.5 text-sm font-medium capitalize">{dayLabel(d.date)}</p>
              <div className="flex flex-wrap gap-2">
                {d.slots.map((s) => (
                  <button key={s.starts_at} type="button" aria-pressed={chosen === s.starts_at} onClick={() => { setChosen(s.starts_at); setError(null); }}
                    className={cn('min-h-11 min-w-16 rounded-lg border px-3 text-sm font-medium tabular-nums', chosen === s.starts_at ? 'text-white' : 'border-border hover:bg-muted')}
                    style={chosen === s.starts_at ? { background: color, borderColor: color } : undefined}
                    aria-label={`${dayLabel(d.date)} às ${s.time}`}>{s.time}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {chosen && (
        <form aria-label="Seus dados" className="space-y-3 rounded-2xl border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await bookPublic(slug, { ...form, mode, consent, starts_at: chosen });
              if (r.ok) setDone({ status: r.status, when: chosen });
              else {
                setError(r.message);
                if (/não está mais disponível/.test(r.message)) {
                  const fresh = await getPublicSlots(slug, slots.from);
                  if (fresh) { setSlots(fresh); setChosen(null); }
                }
              }
            });
          }}>
          <p className="text-sm">Horário escolhido: <span className="font-semibold">{whenLabel(chosen)}</span></p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="bk-name">Nome completo</Label><Input id="bk-name" autoComplete="name" value={form.full_name} maxLength={120} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label htmlFor="bk-email">E-mail</Label><Input id="bk-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label htmlFor="bk-phone">Celular (WhatsApp)</Label><Input id="bk-phone" type="tel" autoComplete="tel" placeholder="(31) 99999-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
          </div>
          {inPerson && online && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Como prefere ser atendido?</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="mode" checked={mode === 'in_person'} onChange={() => setMode('in_person')} /> Presencial</label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="mode" checked={mode === 'online'} onChange={() => setMode('online')} /> On-line</label>
              </div>
            </fieldset>
          )}
          <div className="space-y-1.5"><Label htmlFor="bk-msg">Mensagem (opcional)</Label><Input id="bk-msg" value={form.message} maxLength={500} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
          {/* campo-isca para robôs: fica escondido de pessoas */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="bk-website">Site</label>
            <input id="bk-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Autorizo o consultório a usar estes dados para o agendamento e o contato sobre a consulta.</span>
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full sm:w-auto" disabled={pending} style={{ background: color }}>
            {pending && <Loader2 className="size-4 animate-spin" />} {requireApproval ? 'Pedir agendamento' : 'Agendar consulta'}
          </Button>
        </form>
      )}
    </div>
  );
}
