'use client';

import { AlertTriangle, CheckCircle2, Copy, Loader2, Plus, Send, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { brl } from '@/lib/uan/catalog';
import { createMenu, duplicateMenu, menuAction, setMenuItem, updateMenu, type CycleInput } from '@/lib/uan/menu-actions';
import {
  cycleDate,
  MENU_STATUS_LABEL,
  optionsForSlot,
  repetitions,
  SERVICE_LABEL,
  SERVICES,
  SLOT_LABEL,
  SLOTS,
  type Cycle,
  type MenuDetail,
  type MenuPlanning,
  type MenuService,
  type MenuSlot,
} from '@/lib/uan/menus';
import { AUTONOMY_LABEL, cycleWarnings, dayAdequacy, fmtTarget, TARGET_LABEL } from '@/lib/uan/menu-planning';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const TEXTAREA = 'min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';
const ACTION_LABEL = { submitted: 'Enviado', approved: 'Aprovado', returned: 'Devolvido', reopened: 'Reaberto' } as const;

/** Dados do ciclo (novo ou edição). */
export function CycleForm({ unitId, cycle, onDone, profiles }: { unitId: string; cycle?: Cycle; onDone?: () => void; profiles?: MenuPlanning['profiles'] }) {
  const router = useRouter();
  const [v, setV] = useState<CycleInput>({
    name: cycle?.name ?? '', starts_on: cycle?.starts_on ?? '', length_days: cycle?.length_days ?? 28,
    services: cycle?.services ?? ['lunch'], slots: cycle?.slots ?? ['main', 'side', 'garnish', 'salad', 'dessert', 'beverage'],
    cost_target: cycle?.cost_target_cents ? String(cycle.cost_target_cents / 100).replace('.', ',') : '',
    profile_id: cycle?.profile_id ?? null, autonomy: cycle?.autonomy ?? 'free',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toggle = (k: 'services' | 'slots', x: string) => setV((s) => ({ ...s, [k]: s[k].includes(x) ? s[k].filter((y) => y !== x) : [...s[k], x] }));
  return (
    <form
      aria-label={cycle ? 'Dados do cardápio' : 'Novo cardápio'}
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = cycle ? await updateMenu(cycle.id, v) : await createMenu(unitId, v);
          if (!r.ok) return setError(r.message);
          if (!cycle && r.id) return router.push(`/app/uan/cardapios/${r.id}`);
          router.refresh();
          onDone?.();
        });
      }}
    >
      <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cy-name">Nome do cardápio</Label><Input id="cy-name" maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="cy-start">Começa em</Label><Input id="cy-start" type="date" value={v.starts_on} onChange={(e) => setV({ ...v, starts_on: e.target.value })} /></div>
      <div className="space-y-1.5">
        <Label htmlFor="cy-len">Ciclo</Label>
        <select id="cy-len" className={SELECT} value={v.length_days} onChange={(e) => setV({ ...v, length_days: Number(e.target.value) })}>
          {[7, 14, 21, 28, 35, 42].map((n) => <option key={n} value={n}>{n} dias ({n / 7} semana{n > 7 ? 's' : ''})</option>)}
        </select>
      </div>
      <fieldset className="space-y-1 sm:col-span-2">
        <legend className="text-sm font-medium">Serviços</legend>
        <div className="flex flex-wrap gap-2">{SERVICES.map((x) => <label key={x} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm"><input type="checkbox" className="size-4" checked={v.services.includes(x)} onChange={() => toggle('services', x)} /> {SERVICE_LABEL[x]}</label>)}</div>
      </fieldset>
      <fieldset className="space-y-1 sm:col-span-2">
        <legend className="text-sm font-medium">Composição do prato</legend>
        <div className="flex flex-wrap gap-2">{SLOTS.map((x) => <label key={x} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm"><input type="checkbox" className="size-4" checked={v.slots.includes(x)} onChange={() => toggle('slots', x)} /> {SLOT_LABEL[x]}</label>)}</div>
      </fieldset>
      <div className="space-y-1.5"><Label htmlFor="cy-cost">Teto de custo por refeição (R$, opcional)</Label><Input id="cy-cost" inputMode="decimal" value={v.cost_target} onChange={(e) => setV({ ...v, cost_target: e.target.value })} /></div>
      {profiles && (
        <>
          <div className="space-y-1.5"><Label htmlFor="cy-profile">Perfil de público</Label>
            <select id="cy-profile" className={SELECT} value={v.profile_id ?? ''} onChange={(e) => setV({ ...v, profile_id: e.target.value || null })}>
              <option value="">Sem perfil</option>
              {profiles.filter((p) => !p.platform).map((p) => <option key={p.id} value={p.id}>{p.name}{p.validated ? '' : ' (a validar)'}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="cy-autonomy">Modelo de cardápio</Label>
            <select id="cy-autonomy" className={SELECT} value={v.autonomy} onChange={(e) => setV({ ...v, autonomy: e.target.value })}>
              {Object.entries(AUTONOMY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} {cycle ? 'Salvar dados' : 'Criar cardápio'}</Button>
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>}
      </div>
    </form>
  );
}

export function NewCycle({ unitId }: { unitId: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <CycleForm unitId={unitId} onDone={() => setOpen(false)} />;
  return <Button type="button" onClick={() => setOpen(true)}><Plus className="size-4" /> Novo cardápio</Button>;
}

/** Grade do cardápio (dias × posições) por serviço, com custo, repetições e fluxo de aprovação. */
export function MenuEditor({ detail }: { detail: MenuDetail }) {
  const router = useRouter();
  const c = detail.cycle;
  const [service, setService] = useState<MenuService>(c.services[0]!);
  const [items, setItems] = useState(detail.items);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const reps = repetitions(items, c.length_days);
  const itemAt = (day: number, slot: MenuSlot) => items.find((i) => i.day_index === day && i.service === service && i.slot === slot);
  const days = Array.from({ length: c.length_days }, (_, i) => i + 1);
  const over = new Map((detail.cost?.over ?? []).filter((o) => o.service === service).map((o) => [o.day, o]));
  const planning = detail.planning;
  const targets = planning?.profile && Object.keys(planning.profile.targets).length ? planning.profile.targets : null;
  const warnings = planning && planning.rules.length ? cycleWarnings(items, planning, c) : [];

  const setCell = (day: number, slot: MenuSlot, rootId: string) => {
    const opt = detail.options.find((o) => o.root_id === rootId);
    setItems((l) => [
      ...l.filter((i) => !(i.day_index === day && i.service === service && i.slot === slot)),
      ...(opt ? [{ day_index: day, service, slot, sheet_root_id: opt.root_id, sheet_id: null, name: opt.name, category: opt.category, cost_cents: opt.cost_cents }] : []),
    ]);
    startTransition(async () => {
      setMessage(null);
      const r = await setMenuItem(c.id, { day_index: day, service, slot, sheet_root_id: rootId || null });
      if (!r.ok) setMessage({ text: r.message, error: true });
      router.refresh();
    });
  };
  const act = (action: 'submit' | 'approve' | 'return') =>
    startTransition(async () => {
      setMessage(null);
      const r = await menuAction(c.id, action, note);
      if (!r.ok) return setMessage({ text: r.message, error: true });
      setNote('');
      setMessage({ text: action === 'submit' ? 'Cardápio enviado para aprovação.' : action === 'approve' ? 'Cardápio aprovado: a equipe já vê o cardápio do dia.' : 'Cardápio devolvido para ajustes.' });
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={c.status === 'approved' ? 'default' : 'secondary'}>{MENU_STATUS_LABEL[c.status]}</Badge>
        <span className="text-sm text-muted-foreground">
          {c.length_days} dias desde {cycleDate(c.starts_on, 1).label}{c.cost_target_cents ? ` · teto ${brl(c.cost_target_cents)} por refeição` : ''}
        </span>
        {planning?.profile && <Badge variant="outline">Perfil: {planning.profile.name}{planning.profile.validated ? '' : ' (a validar)'}</Badge>}
        {planning && <Badge variant="outline">{AUTONOMY_LABEL[planning.autonomy]}</Badge>}
        {detail.can_edit && !editing && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>Editar dados</Button>}
        {detail.can_edit && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => { const r = await duplicateMenu(c.id); if (r.ok && r.id) router.push(`/app/uan/cardapios/${r.id}`); else if (!r.ok) setMessage({ text: r.message, error: true }); })}><Copy className="size-4" /> Duplicar</Button>}
      </div>
      {editing && <CycleForm unitId={detail.unit.id} cycle={c} profiles={detail.planning?.profiles ?? []} onDone={() => setEditing(false)} />}

      {c.services.length > 1 && (
        <nav aria-label="Serviços" className="flex flex-wrap gap-2">
          {c.services.map((s) => (
            <button key={s} type="button" aria-pressed={service === s} onClick={() => setService(s)}
              className={cn('rounded-full border px-3 py-1 text-sm', service === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
              {SERVICE_LABEL[s]}
            </button>
          ))}
        </nav>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <caption className="sr-only">Cardápio de {SERVICE_LABEL[service]}</caption>
          <thead>
            <tr className="text-muted-foreground">
              <th className="w-28 p-2 font-medium">Dia</th>
              {c.slots.map((sl) => <th key={sl} className="p-2 font-medium">{SLOT_LABEL[sl]}</th>)}
              {targets && <th className="w-28 p-2 font-medium">Metas</th>}
              {detail.cost && <th className="w-24 p-2 text-right font-medium">Custo</th>}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const dt = cycleDate(c.starts_on, d);
              const total = detail.cost?.totals[`${d}:${service}`];
              const o = over.get(d);
              return (
                <tr key={d} className={cn('border-t border-border align-top', d % 7 === 1 && d > 1 && 'border-t-2')}>
                  <th scope="row" className="p-2 font-normal whitespace-nowrap">Dia {d}<span className="block text-xs text-muted-foreground">{dt.label}</span></th>
                  {c.slots.map((sl) => {
                    const it = itemAt(d, sl);
                    const rep = reps.get(`${d}:${service}:${sl}`);
                    const { match, others } = optionsForSlot(detail.options, sl);
                    return (
                      <td key={sl} className={cn('p-1.5', rep && 'bg-amber-50 dark:bg-amber-950/30')}>
                        {detail.can_edit ? (
                          <select aria-label={`${SLOT_LABEL[sl]} do dia ${d}`} className={SELECT} value={it?.sheet_root_id ?? ''} disabled={pending} onChange={(e) => setCell(d, sl, e.target.value)}>
                            <option value="">—</option>
                            {match.length > 0 && <optgroup label={SLOT_LABEL[sl]}>{match.map((m) => <option key={m.root_id} value={m.root_id}>{m.name}</option>)}</optgroup>}
                            {others.length > 0 && <optgroup label="Outras fichas">{others.map((m) => <option key={m.root_id} value={m.root_id}>{m.name}</option>)}</optgroup>}
                          </select>
                        ) : (
                          <span>{it?.name ?? '—'}</span>
                        )}
                        {rep && <span className="mt-0.5 block text-xs text-amber-800 dark:text-amber-300">Repetido há {rep} dia(s)</span>}
                      </td>
                    );
                  })}
                  {targets && (() => {
                    const rows = dayAdequacy(items, service, d, targets);
                    const bad = rows.filter((r) => r.status === 'low' || r.status === 'high');
                    return (
                      <td className="p-2 text-xs" title={rows.map((r) => `${TARGET_LABEL[r.key] ?? r.key}: ${r.value ?? '—'} (meta ${fmtTarget(r.range)})`).join('\n')}>
                        {rows.length === 0 ? '—' : bad.length === 0 ? <span className="text-emerald-700 dark:text-emerald-400">Dentro das metas</span> : (
                          <span className="text-amber-800 dark:text-amber-300">{bad.map((r) => `${TARGET_LABEL[r.key]?.split(' (')[0] ?? r.key} ${r.status === 'low' ? 'baixo' : 'alto'}`).join(', ')}</span>
                        )}
                      </td>
                    );
                  })()}
                  {detail.cost && (
                    <td className={cn('p-2 text-right tabular-nums', o && 'font-semibold text-destructive')}>
                      {total ? brl(total) : '—'}
                      {o && <span className="block text-xs">+{o.pct.toLocaleString('pt-BR')}% do teto</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {detail.options.length === 0 && detail.can_edit && <p className="text-sm text-muted-foreground">Nenhuma ficha técnica aprovada ainda: aprove fichas para montar o cardápio.</p>}
      {warnings.length > 0 && (
        <section aria-labelledby="regras-contrato" className="space-y-2 rounded-2xl border border-amber-500/50 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
          <h2 id="regras-contrato" className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" aria-hidden="true" /> Regras do contrato ({warnings.length})</h2>
          <ul className="list-disc space-y-0.5 pl-5">{warnings.slice(0, 30).map((w, i) => <li key={i}>{w.day ? `Dia ${w.day}${w.service ? ` (${SERVICE_LABEL[w.service as MenuService]})` : ''}: ` : ''}{w.message}</li>)}</ul>
        </section>
      )}
      {planning && !planning.profile && detail.can_edit && <p className="text-xs text-muted-foreground">Escolha um perfil de público em “Editar dados” para ver a adequação às metas (perfis em UAN › Perfis e regras).</p>}

      {(detail.can_submit || detail.can_approve) && (
        <section aria-labelledby="fluxo" className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 id="fluxo" className="font-semibold">{detail.can_submit ? 'Enviar para aprovação' : 'Aprovação'}</h2>
          {(detail.cost?.over.length ?? 0) > 0 && (
            <p className="flex items-start gap-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {detail.cost!.over.length} refeição(ões) acima do teto de custo.{detail.can_submit ? ' Justifique para enviar.' : ''}</p>
          )}
          {c.status === 'submitted' && c.justification && <p className="rounded-lg bg-muted/60 p-2 text-sm">Justificativa: {c.justification}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="mn-note">{detail.can_submit ? 'Observação ou justificativa' : 'Observação (obrigatória para devolver)'}</Label>
            <textarea id="mn-note" className={TEXTAREA} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.can_submit && <Button type="button" disabled={pending} onClick={() => act('submit')}><Send className="size-4" /> Enviar para aprovação</Button>}
            {detail.can_approve && <Button type="button" disabled={pending} onClick={() => act('approve')}><CheckCircle2 className="size-4" /> Aprovar cardápio</Button>}
            {detail.can_approve && <Button type="button" variant="outline" disabled={pending} onClick={() => act('return')}><Undo2 className="size-4" /> Devolver</Button>}
          </div>
        </section>
      )}
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}

      {detail.history.length > 0 && (
        <section aria-labelledby="historico" className="space-y-2">
          <h2 id="historico" className="font-semibold">Histórico</h2>
          <ul className="space-y-1 text-sm">
            {detail.history.map((h, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-medium text-foreground">{ACTION_LABEL[h.action]}</span> · {new Date(h.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                {h.user_name && ` · ${h.user_name}`}{h.note && ` — ${h.note}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
