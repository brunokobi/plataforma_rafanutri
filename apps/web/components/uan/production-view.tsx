'use client';

import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { wasteIndicators } from '@rafanutri/nutrition-core';
import { brl, UNIT_LABEL } from '@/lib/uan/catalog';
import { SERVICE_LABEL, SERVICES, SLOT_LABEL, WEEKDAY_SHORT_FULL, type MenuService } from '@/lib/uan/menus';
import { applyPattern, saveDiners, saveWaste } from '@/lib/uan/production-actions';
import { RecordTemperature } from '@/components/uan/record-temperature';
import { stockOut } from '@/lib/uan/stock-actions';
import { ccpStage, dayRequisition, kg, meetsCcp, prepList, serviceIndicators, sheetInputs, WASTE_REASON_LABEL, type ProductionDay, type WasteReason } from '@/lib/uan/production';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const toKg = (g: number | null | undefined) => (g === null || g === undefined ? '' : String(g / 1000).replace('.', ','));
const toG = (s: string) => (s.trim() ? Math.round(Number(s.replace(',', '.')) * 1000) : null);
const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('pt-BR')}%`);
type Msg = { text: string; error?: boolean } | null;

function useRun() {
  const router = useRouter();
  const [message, setMessage] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; days?: number }>, done: (r: { days?: number }) => string) =>
    startTransition(async () => {
      setMessage(null);
      const r = await fn();
      if (!r.ok) return setMessage({ text: r.message ?? 'Não foi possível salvar.', error: true });
      setMessage({ text: done(r) });
      router.refresh();
    });
  return { message, pending, run };
}

function DinersRow({ unitId, day, service, planned, actual, canPlan }: { unitId: string; day: string; service: MenuService; planned: number | null; actual: number | null; canPlan: boolean }) {
  const [v, setV] = useState({ planned: planned?.toString() ?? '', actual: actual?.toString() ?? '' });
  const { message, pending, run } = useRun();
  return (
    <form
      aria-label={`Comensais do ${SERVICE_LABEL[service]}`}
      className="grid grid-cols-[1fr_6rem_6rem_auto] items-end gap-2"
      onSubmit={(e) => { e.preventDefault(); run(() => saveDiners(unitId, { day, service, ...v }), () => 'Comensais salvos.'); }}
    >
      <span className="pb-2 text-sm font-medium">{SERVICE_LABEL[service]}</span>
      <div className="space-y-1"><Label htmlFor={`pl-${service}`} className="text-xs">Previstos</Label><Input id={`pl-${service}`} inputMode="numeric" disabled={!canPlan} value={v.planned} onChange={(e) => setV({ ...v, planned: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`ac-${service}`} className="text-xs">Realizados</Label><Input id={`ac-${service}`} inputMode="numeric" disabled={!canPlan} value={v.actual} onChange={(e) => setV({ ...v, actual: e.target.value })} /></div>
      {canPlan ? <Button type="submit" size="icon" variant="outline" aria-label={`Salvar comensais do ${SERVICE_LABEL[service]}`} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}</Button> : <span />}
      {message && <p role={message.error ? 'alert' : 'status'} className={`col-span-4 text-xs ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>{message.text}</p>}
    </form>
  );
}

function PatternForm({ unitId, day }: { unitId: string; day: string }) {
  const [v, setV] = useState({ service: 'lunch' as MenuService, planned: '', weekdays: [1, 2, 3, 4, 5], from: day, to: `${day.slice(0, 8)}${String(new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}` });
  const { message, pending, run } = useRun();
  return (
    <form
      aria-label="Padrão semanal de comensais"
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
      onSubmit={(e) => { e.preventDefault(); run(() => applyPattern(unitId, { ...v, planned: Number(v.planned) }), (r) => `Padrão aplicado em ${r.days ?? 0} dia(s).`); }}
    >
      <h3 className="font-semibold sm:col-span-2">Padrão semanal</h3>
      <div className="space-y-1.5"><Label htmlFor="pt-service">Serviço</Label><select id="pt-service" className={SELECT} value={v.service} onChange={(e) => setV({ ...v, service: e.target.value as MenuService })}>{SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor="pt-planned">Comensais previstos</Label><Input id="pt-planned" inputMode="numeric" value={v.planned} onChange={(e) => setV({ ...v, planned: e.target.value })} /></div>
      <fieldset className="space-y-1 sm:col-span-2"><legend className="text-sm font-medium">Dias</legend>
        <div className="flex flex-wrap gap-1">{WEEKDAY_SHORT_FULL.map((d, i) => <label key={d} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm"><input type="checkbox" className="size-4" checked={v.weekdays.includes(i + 1)} onChange={(e) => setV({ ...v, weekdays: e.target.checked ? [...v.weekdays, i + 1] : v.weekdays.filter((x) => x !== i + 1) })} /> {d}</label>)}</div>
      </fieldset>
      <div className="space-y-1.5"><Label htmlFor="pt-from">De</Label><Input id="pt-from" type="date" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="pt-to">Até</Label><Input id="pt-to" type="date" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} /></div>
      <div className="sm:col-span-2"><Button type="submit" variant="outline" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Aplicar padrão</Button></div>
      {message && <p role={message.error ? 'alert' : 'status'} className={`text-sm sm:col-span-2 ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>{message.text}</p>}
    </form>
  );
}

function WasteForm({ unitId, day, service, rootId, label, initial }: { unitId: string; day: string; service: MenuService; rootId: string | null; label: string; initial?: ProductionDay['waste'][number] }) {
  const [v, setV] = useState({
    produced: toKg(initial?.produced_g), leftover: toKg(initial?.leftover_g), plate: toKg(initial?.plate_waste_g),
    portions: initial?.portions_served?.toString() ?? '', reason: initial?.reason ?? '',
  });
  const { message, pending, run } = useRun();
  const id = (k: string) => `w-${service}-${rootId ?? 'svc'}-${k}`;
  return (
    <form
      aria-label={`Pesagem de ${label}`}
      className="grid gap-2 border-t border-border py-3 sm:grid-cols-[1fr_repeat(3,6.5rem)_9rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveWaste(unitId, rootId
          ? { day, service, sheet_root_id: rootId, produced_g: toG(v.produced), leftover_g: toG(v.leftover), portions_served: v.portions || null, reason: v.reason || null }
          : { day, service, sheet_root_id: null, plate_waste_g: toG(v.plate), reason: v.reason || null }), () => 'Pesagem salva.');
      }}
    >
      <span className="text-sm font-medium sm:pb-2">{label}</span>
      {rootId ? (
        <>
          <div className="space-y-1"><Label htmlFor={id('p')} className="text-xs">Produzido (kg)</Label><Input id={id('p')} inputMode="decimal" value={v.produced} onChange={(e) => setV({ ...v, produced: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor={id('l')} className="text-xs">Sobra limpa (kg)</Label><Input id={id('l')} inputMode="decimal" value={v.leftover} onChange={(e) => setV({ ...v, leftover: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor={id('s')} className="text-xs">Porções servidas</Label><Input id={id('s')} inputMode="numeric" value={v.portions} onChange={(e) => setV({ ...v, portions: e.target.value })} /></div>
        </>
      ) : (
        <div className="space-y-1 sm:col-span-3"><Label htmlFor={id('r')} className="text-xs">Resto-ingesta das bandejas (kg)</Label><Input id={id('r')} inputMode="decimal" value={v.plate} onChange={(e) => setV({ ...v, plate: e.target.value })} /></div>
      )}
      <div className="space-y-1">
        <Label htmlFor={id('m')} className="text-xs">Motivo</Label>
        <select id={id('m')} className={SELECT} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value as WasteReason })}>
          <option value="">—</option>
          {(Object.keys(WASTE_REASON_LABEL) as WasteReason[]).map((r) => <option key={r} value={r}>{WASTE_REASON_LABEL[r]}</option>)}
        </select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar</Button>
      {message && <p role={message.error ? 'alert' : 'status'} className={`text-xs sm:col-span-6 ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>{message.text}</p>}
    </form>
  );
}

/** Produção do dia: comensais, lista de preparo, requisição, pesagem e indicadores de desperdício. */
export function ProductionView({ data }: { data: ProductionDay }) {
  const [margin, setMargin] = useState('5');
  const inputs = useMemo(() => sheetInputs(data.graph), [data.graph]);
  const prep = useMemo(() => prepList(data, inputs), [data, inputs]);
  const req = useMemo(() => dayRequisition(prep, inputs, data.graph.ingredients, Number(margin.replace(',', '.')) || 0), [prep, inputs, data.graph.ingredients, margin]);
  const withdraw = useRun();
  const services = SERVICES.filter((s) => data.menu.some((m) => m.service === s) || data.diners.some((d) => d.service === s));
  const shown = services.length ? services : (['lunch'] as MenuService[]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="comensais" className="space-y-3">
        <h2 id="comensais" className="font-display text-xl font-semibold">Comensais</h2>
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {shown.map((s) => {
            const d = data.diners.find((x) => x.service === s);
            return <DinersRow key={`${s}-${d?.planned}-${d?.actual}`} unitId={data.unit.id} day={data.day} service={s} planned={d?.planned ?? null} actual={d?.actual ?? null} canPlan={data.can_plan} />;
          })}
        </div>
        {data.can_plan && <PatternForm unitId={data.unit.id} day={data.day} />}
      </section>

      <section aria-labelledby="preparo" className="space-y-3">
        <h2 id="preparo" className="font-display text-xl font-semibold">Lista de preparo</h2>
        {prep.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem cardápio aprovado para este dia.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[32rem] text-left text-sm tabular-nums">
              <caption className="sr-only">Preparações do dia</caption>
              <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Preparação</th><th className="p-2 font-medium">Serviço</th><th className="p-2 text-right font-medium">Adesão</th><th className="p-2 text-right font-medium">Porções</th><th className="p-2 text-right font-medium">Produzir</th></tr></thead>
              <tbody>
                {prep.map((p) => (
                  <tr key={`${p.service}-${p.slot}`} className="border-t border-border">
                    <td className="p-2">{p.name}<span className="block text-xs text-muted-foreground">{SLOT_LABEL[p.slot]}</span></td>
                    <td className="p-2">{SERVICE_LABEL[p.service]}</td>
                    <td className="p-2 text-right">{p.adhesion === null ? '100% (sem histórico)' : pct(Math.round(p.adhesion * 1000) / 10)}</td>
                    <td className="p-2 text-right" aria-label={`Porções de ${p.name}`}>{p.portions}{p.factor && p.factor !== 1 ? <span className="block text-xs text-muted-foreground">per capita × {p.factor.toLocaleString('pt-BR')}</span> : null}</td>
                    <td className="p-2 text-right">{p.yieldG === null ? '—' : kg(p.yieldG)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {prep.some((p) => !data.diners.find((d) => d.service === p.service)?.planned) && (
          <p className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400"><AlertTriangle className="size-4" aria-hidden="true" /> Informe os comensais previstos para calcular as porções.</p>
        )}
      </section>

      {(data.ccps?.length ?? 0) > 0 && (
        <section aria-labelledby="pcc-dia" className="space-y-3">
          <h2 id="pcc-dia" className="font-display text-xl font-semibold">Pontos críticos de controle do dia</h2>
          <p className="text-sm text-muted-foreground">Do APPCC aprovado das preparações de hoje: registre a temperatura de cada PCC.</p>
          <ul aria-label="PCC do dia" className="space-y-3">
            {data.ccps!.map((c) => {
              const last = c.readings[0];
              const ok = last ? meetsCcp(last.value, c) : null;
              return (
                <li key={c.id} className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
                  <p className="font-medium">{c.ccp_number ? `PCC ${c.ccp_number} · ` : ''}{c.dish} — {c.step}</p>
                  <p className="text-muted-foreground">{c.description} · limite: {c.critical_limit ?? '—'}{c.monitoring_frequency ? ` · ${c.monitoring_frequency}` : ''}</p>
                  {last ? (
                    <p className={ok ? 'text-emerald-700 dark:text-emerald-400' : 'font-semibold text-destructive'}>
                      Última medição: {last.value.toLocaleString('pt-BR')} °C às {new Date(last.recorded_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}{ok ? ' — dentro do limite crítico' : ` — fora do limite crítico. ${c.corrective_action ?? ''}`}
                    </p>
                  ) : <p className="font-medium text-amber-700 dark:text-amber-400">Pendente: nenhuma medição hoje.</p>}
                  {data.can_record && <RecordTemperature unitId={data.unit.id} idPrefix={`pcc-${c.id}`} initialFood={c.dish} initialStage={ccpStage(c)} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {req.length > 0 && (
        <section aria-labelledby="requisicao" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="requisicao" className="font-display text-xl font-semibold">Requisição de insumos</h2>
            <div className="w-32 space-y-1"><Label htmlFor="rq-margin" className="text-xs">Margem (%)</Label><Input id="rq-margin" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} /></div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[32rem] text-left text-sm tabular-nums">
              <caption className="sr-only">Insumos consolidados do dia (peso bruto, já com o FC)</caption>
              <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Insumo</th><th className="p-2 text-right font-medium">Peso bruto</th><th className="p-2 text-right font-medium">Retirar</th><th className="p-2 font-medium">Usado em</th></tr></thead>
              <tbody>
                {req.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-right" aria-label={`Peso bruto de ${r.name}`}>{kg(r.grossG)}</td>
                    <td className="p-2 text-right">{r.purchaseQty === null ? '—' : `${r.purchaseQty.toLocaleString('pt-BR')} ${UNIT_LABEL[r.purchaseUnit as keyof typeof UNIT_LABEL] ?? r.purchaseUnit}`}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.from.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.can_record && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" disabled={withdraw.pending}
                onClick={() => { if (window.confirm('Retirar do estoque os insumos da requisição (lotes que vencem antes primeiro)?')) withdraw.run(() => stockOut(data.unit.id, { kind: 'out_production', reason: `Produção de ${data.day}`, lines: req.map((r) => ({ ingredient_id: r.id, quantity_g: r.grossG })) }), () => 'Retirada registrada no estoque.'); }}>
                {withdraw.pending && <Loader2 className="size-4 animate-spin" />} Retirar do estoque
              </Button>
              {withdraw.message && <p role={withdraw.message.error ? 'alert' : 'status'} className={withdraw.message.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{withdraw.message.text}</p>}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="desperdicio" className="space-y-3">
        <h2 id="desperdicio" className="font-display text-xl font-semibold">Pesagem e desperdício</h2>
        {shown.map((s) => {
          const ind = serviceIndicators(data, s, prep);
          return (
            <div key={s} className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h3 className="font-semibold">{SERVICE_LABEL[s]}</h3>
              {ind && (
                <dl aria-label={`Indicadores do ${SERVICE_LABEL[s]}`} className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <div><dt className="text-muted-foreground">Sobra limpa</dt><dd className="font-semibold tabular-nums">{pct(ind.leftoverPct)}</dd></div>
                  <div><dt className="text-muted-foreground">Resto-ingesta</dt><dd className="font-semibold tabular-nums">{pct(ind.plateWastePct)}</dd></div>
                  <div><dt className="text-muted-foreground">Per capita de resto</dt><dd className="font-semibold tabular-nums">{ind.perCapitaWasteG === null ? '—' : `${ind.perCapitaWasteG.toLocaleString('pt-BR')} g`}</dd></div>
                  <div><dt className="text-muted-foreground">Aceitação</dt><dd className="font-semibold tabular-nums">{pct(ind.acceptancePct)}</dd></div>
                  {data.can_see_cost && <div><dt className="text-muted-foreground">Custo do desperdício</dt><dd className="font-semibold tabular-nums">{ind.wasteCostCents === null ? '—' : brl(ind.wasteCostCents)}</dd></div>}
                </dl>
              )}
              {data.can_record ? (
                <>
                  {prep.filter((p) => p.service === s).map((p) => (
                    <WasteForm key={`${p.rootId}-${data.day}`} unitId={data.unit.id} day={data.day} service={s} rootId={p.rootId} label={p.name} initial={data.waste.find((w) => w.service === s && w.sheet_root_id === p.rootId)} />
                  ))}
                  <WasteForm key={`svc-${data.day}`} unitId={data.unit.id} day={data.day} service={s} rootId={null} label="Resto das bandejas" initial={data.waste.find((w) => w.service === s && w.sheet_root_id === null)} />
                </>
              ) : !ind && <p className="text-sm text-muted-foreground">Sem pesagem registrada.</p>}
            </div>
          );
        })}
      </section>

      {data.history.length > 0 && (
        <section aria-labelledby="historico-desp" className="space-y-3">
          <h2 id="historico-desp" className="font-display text-xl font-semibold">Últimos 14 dias</h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[32rem] text-left text-sm tabular-nums">
              <caption className="sr-only">Desperdício por dia e serviço</caption>
              <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Dia</th><th className="p-2 font-medium">Serviço</th><th className="p-2 text-right font-medium">Produzido</th><th className="p-2 text-right font-medium">Sobra</th><th className="p-2 text-right font-medium">Resto-ingesta</th><th className="p-2 text-right font-medium">Per capita</th></tr></thead>
              <tbody>
                {data.history.map((h) => {
                  const w = h.produced_g >= h.leftover_g ? wasteIndicators({ producedG: h.produced_g, leftoverG: h.leftover_g, plateWasteG: h.plate_waste_g, diners: h.diners ?? 0 }) : null;
                  return (
                    <tr key={`${h.day}-${h.service}`} className="border-t border-border">
                      <td className="p-2">{h.day.split('-').reverse().slice(0, 2).join('/')}</td>
                      <td className="p-2">{SERVICE_LABEL[h.service]}</td>
                      <td className="p-2 text-right">{h.produced_g ? kg(h.produced_g) : '—'}</td>
                      <td className="p-2 text-right">{pct(w?.leftoverPct ?? null)}</td>
                      <td className="p-2 text-right">{pct(w?.plateWastePct ?? null)}</td>
                      <td className="p-2 text-right">{w?.perCapitaWasteG == null ? '—' : `${w.perCapitaWasteG.toLocaleString('pt-BR')} g`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
