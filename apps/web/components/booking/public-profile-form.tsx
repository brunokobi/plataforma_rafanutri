'use client';

import { ExternalLink, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { savePublicProfile } from '@/lib/booking/actions';
import { DEFAULT_PROFILE, WEEKDAY_LABEL, type PublicProfileData } from '@/lib/booking/types';
import { centsToInput, parseMoneyToCents } from '@/lib/finance/money';

/** RN-068 — Configuração da página pública e do agendamento online (owner). */
export function PublicProfileForm({ orgId, data, siteUrl }: { orgId: string; data: PublicProfileData; siteUrl: string }) {
  const initial = data.profile ?? DEFAULT_PROFILE;
  const [v, setV] = useState({ ...initial, nutritionist_id: initial.nutritionist_id ?? data.nutritionists[0]?.id ?? null });
  const [specialties, setSpecialties] = useState(initial.specialties.join(', '));
  const [priceFirst, setPriceFirst] = useState(initial.price_first_cents ? centsToInput(initial.price_first_cents) : '');
  const [priceReturn, setPriceReturn] = useState(initial.price_return_cents ? centsToInput(initial.price_return_cents) : '');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const url = `${siteUrl}/n/${data.slug}`;
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));

  return (
    <form aria-label="Página pública" className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const pf = priceFirst.trim() ? parseMoneyToCents(priceFirst) : null;
        const pr = priceReturn.trim() ? parseMoneyToCents(priceReturn) : null;
        if ((priceFirst.trim() && !pf) || (priceReturn.trim() && !pr)) return setFeedback({ ok: false, text: 'Valor inválido, use por exemplo 250,00.' });
        setFeedback(null);
        start(async () => {
          const r = await savePublicProfile(orgId, { ...v, specialties: specialties.split(',').map((s) => s.trim()).filter(Boolean), price_first_cents: pf, price_return_cents: pr });
          setFeedback(r.ok ? { ok: true, text: 'Página salva.' } : { ok: false, text: r.message });
        });
      }}>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={v.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Página pública no ar</label>
        <p className="text-sm text-muted-foreground">
          Endereço: <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{url} <ExternalLink className="size-3.5" /></a>
          {!data.profile?.enabled && ' (fica no ar depois de salvar com a opção marcada)'}
        </p>
        <div className="space-y-1.5"><Label htmlFor="pp-headline">Chamada</Label><Input id="pp-headline" maxLength={120} placeholder="Nutrição sem dieta da moda" value={v.headline ?? ''} onChange={(e) => set('headline', e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="pp-bio">Apresentação</Label>
          <textarea id="pp-bio" rows={5} maxLength={1500} value={v.bio ?? ''} onChange={(e) => set('bio', e.target.value)} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" /></div>
        <div className="space-y-1.5"><Label htmlFor="pp-specialties">Especialidades (separadas por vírgula)</Label><Input id="pp-specialties" value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="Emagrecimento, Nutrição esportiva" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="pp-address">Endereço</Label><Input id="pp-address" maxLength={200} value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-city">Cidade</Label><Input id="pp-city" maxLength={80} value={v.city ?? ''} onChange={(e) => set('city', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-price-first">Valor da 1ª consulta (opcional)</Label><Input id="pp-price-first" inputMode="decimal" value={priceFirst} onChange={(e) => setPriceFirst(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-price-return">Valor do retorno (opcional)</Label><Input id="pp-price-return" inputMode="decimal" value={priceReturn} onChange={(e) => setPriceReturn(e.target.value)} /></div>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.in_person} onChange={(e) => set('in_person', e.target.checked)} /> Presencial</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.online} onChange={(e) => set('online', e.target.checked)} /> On-line</label>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={v.booking_enabled} onChange={(e) => set('booking_enabled', e.target.checked)} /> Agendamento online</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.require_approval} onChange={(e) => set('require_approval', e.target.checked)} /> Eu confirmo cada pedido antes de virar consulta (recomendado)</label>
        <p className="text-xs text-muted-foreground">Sem confirmação, o paciente e a consulta são criados na hora (se houver vaga no plano; se não, o pedido fica pendente). Os horários livres seguem o expediente abaixo e a agenda.</p>
        {data.nutritionists.length > 1 && (
          <div className="space-y-1.5"><Label htmlFor="pp-nutri">Agenda de</Label>
            <select id="pp-nutri" value={v.nutritionist_id ?? ''} onChange={(e) => set('nutritionist_id', e.target.value)} className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm">
              {data.nutritionists.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select></div>
        )}
        <fieldset className="space-y-1"><legend className="text-sm font-medium">Dias de atendimento</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <label key={d} className="flex items-center gap-1.5"><input type="checkbox" checked={v.weekdays.includes(d)} onChange={(e) => set('weekdays', e.target.checked ? [...v.weekdays, d].sort() : v.weekdays.filter((x) => x !== d))} /> {WEEKDAY_LABEL[d]}</label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-1.5"><Label htmlFor="pp-start">Início</Label><Input id="pp-start" type="time" value={v.day_start} onChange={(e) => set('day_start', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-end">Fim</Label><Input id="pp-end" type="time" value={v.day_end} onChange={(e) => set('day_end', e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-slot">Duração</Label>
            <select id="pp-slot" value={v.slot_minutes} onChange={(e) => set('slot_minutes', Number(e.target.value))} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              {[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select></div>
          <div className="space-y-1.5"><Label htmlFor="pp-notice">Antecedência (h)</Label><Input id="pp-notice" type="number" min={0} max={168} value={v.min_notice_hours} onChange={(e) => set('min_notice_hours', Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor="pp-ahead">Até (dias)</Label><Input id="pp-ahead" type="number" min={1} max={90} value={v.max_days_ahead} onChange={(e) => set('max_days_ahead', Number(e.target.value))} /></div>
        </div>
      </section>
      {feedback && <p role={feedback.ok ? 'status' : 'alert'} className={feedback.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{feedback.text}</p>}
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar página</Button>
    </form>
  );
}
