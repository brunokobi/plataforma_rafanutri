'use client';

import { Copy, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copyProfile, createProfile, createRule, deactivateRule, saveProfile } from '@/lib/uan/menu-planning-actions';
import { fmtTarget, RULE_KIND_LABEL, ruleText, SEGMENT_LABEL, TARGET_KEYS, TARGET_LABEL, type DinerProfile, type MenuPlanningOrg, type Segment } from '@/lib/uan/menu-planning';
import { SERVICE_LABEL, SERVICES, SLOT_LABEL, SLOTS } from '@/lib/uan/menus';
import { SHEET_CATEGORY_LABEL, type SheetCategory } from '@/lib/uan/techsheets';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs';
type Msg = { text: string; error?: boolean } | null;
const txt = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

function ProfileForm({ p, onDone }: { p: DinerProfile; onDone: () => void }) {
  const router = useRouter();
  const keys = [...TARGET_KEYS, ...Object.keys(p.targets).filter((k) => !TARGET_KEYS.includes(k))];
  const [v, setV] = useState({
    name: p.name, segment: p.segment, stage: p.stage ?? '', diet: p.diet ?? '', services: p.services as string[], reference: p.reference ?? '', validated: p.validated, active: p.active,
    targets: Object.fromEntries(keys.map((k) => [k, { min: txt(p.targets[k]?.min), max: txt(p.targets[k]?.max), target: txt(p.targets[k]?.target) }])),
  });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form aria-label={`Perfil ${p.name}`} className="space-y-3 rounded-xl border border-border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setMsg(null);
          const r = await saveProfile(p.id, v);
          if (!r.ok) return setMsg({ text: r.message, error: true });
          router.refresh();
          onDone();
        });
      }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor={`pf-${p.id}-name`}>Nome</Label><Input id={`pf-${p.id}-name`} maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor={`pf-${p.id}-seg`}>Público</Label>
          <select id={`pf-${p.id}-seg`} className={SELECT} value={v.segment} onChange={(e) => setV({ ...v, segment: e.target.value as Segment })}>{(Object.keys(SEGMENT_LABEL) as Segment[]).map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}</select>
        </div>
        <div className="space-y-1.5"><Label htmlFor={`pf-${p.id}-stage`}>Etapa ou faixa etária</Label><Input id={`pf-${p.id}-stage`} maxLength={120} value={v.stage} onChange={(e) => setV({ ...v, stage: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor={`pf-${p.id}-diet`}>Dieta</Label><Input id={`pf-${p.id}-diet`} maxLength={120} value={v.diet} onChange={(e) => setV({ ...v, diet: e.target.value })} /></div>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Serviços</legend>
        <div className="flex flex-wrap gap-2">{SERVICES.map((s) => <label key={s} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm"><input type="checkbox" className="size-4" checked={v.services.includes(s)} onChange={() => setV({ ...v, services: v.services.includes(s) ? v.services.filter((x) => x !== s) : [...v.services, s] })} /> {SERVICE_LABEL[s]}</label>)}</div>
      </fieldset>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm" aria-label="Metas por refeição">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Meta por refeição</th><th className="py-1 font-medium">Mínimo</th><th className="py-1 font-medium">Máximo</th><th className="py-1 font-medium">Alvo</th></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <th scope="row" className="py-1 pr-2 text-left font-normal">{TARGET_LABEL[k] ?? k}</th>
                {(['min', 'max', 'target'] as const).map((f) => (
                  <td key={f} className="py-1 pr-2"><Input aria-label={`${TARGET_LABEL[k] ?? k} — ${f === 'min' ? 'mínimo' : f === 'max' ? 'máximo' : 'alvo'}`} inputMode="decimal" className="h-8" value={v.targets[k]![f]} onChange={(e) => setV({ ...v, targets: { ...v.targets, [k]: { ...v.targets[k]!, [f]: e.target.value } } })} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-1.5"><Label htmlFor={`pf-${p.id}-ref`}>Referência</Label><Input id={`pf-${p.id}-ref`} maxLength={300} value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.validated} onChange={(e) => setV({ ...v, validated: e.target.checked })} /> Metas revisadas pela RT</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Perfil em uso</label>
      {msg && <p role="alert" className="text-sm text-destructive">{msg.text}</p>}
      <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar perfil</Button><Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button></div>
    </form>
  );
}

/** Perfis de público (metas) e regras do contrato da empresa. */
export function MenuPlanningView({ data }: { data: MenuPlanningOrg }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [np, setNp] = useState({ name: '', segment: 'pat' as Segment });
  const [rule, setRule] = useState<Record<'kind' | 'ingredient_id' | 'sheet_category' | 'slot' | 'service' | 'max_count' | 'cost' | 'profile_id' | 'note', string>>({ kind: 'vetoed_ingredient', ingredient_id: '', sheet_category: 'main', slot: 'salad', service: '', max_count: '2', cost: '', profile_id: '', note: '' });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const mine = data.profiles.filter((p) => !p.platform).sort((a, b) => Number(b.active) - Number(a.active));
  const platform = data.profiles.filter((p) => p.platform);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; id?: string }>, done: string, after?: (id?: string) => void) =>
    startTransition(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) return setMsg({ text: r.message ?? 'Não foi possível salvar.', error: true });
      setMsg({ text: done });
      after?.(r.id);
      router.refresh();
    });
  const ruleBody = (): Record<string, string | null> => {
    const k = rule.kind;
    return {
      kind: k, profile_id: rule.profile_id || null, note: rule.note || null,
      ingredient_id: k === 'vetoed_ingredient' || (k === 'max_per_week' && rule.ingredient_id) ? rule.ingredient_id || null : null,
      sheet_category: k === 'vetoed_category' || (k === 'max_per_week' && !rule.ingredient_id) ? rule.sheet_category : null,
      slot: k === 'required_daily' ? rule.slot : null,
      service: k === 'required_daily' || k === 'cost_ceiling' ? rule.service || null : null,
      max_count: k === 'max_per_week' ? rule.max_count : null,
      cost: k === 'cost_ceiling' ? rule.cost : null,
    };
  };

  return (
    <div className="space-y-10">
      <section aria-labelledby="perfis" className="space-y-3">
        <h2 id="perfis" className="font-display text-xl font-semibold">Perfis de público</h2>
        <p className="text-sm text-muted-foreground">As metas por refeição do perfil aparecem no cardápio como adequação de cada dia. Escolha o perfil no cardápio da unidade.</p>
        {mine.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum perfil da empresa ainda. Copie um modelo abaixo ou crie um.</p> : (
          <ul aria-label="Perfis da empresa" className="space-y-2">
            {mine.map((p) => (
              <li key={p.id} className="space-y-2 rounded-2xl border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">{SEGMENT_LABEL[p.segment]}{p.stage ? ` · ${p.stage}` : ''} · {Object.keys(p.targets).length} meta(s){!p.active ? ' · fora de uso' : ''}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {p.validated ? <Badge variant="outline">Revisado pela RT</Badge> : <Badge variant="secondary">A validar</Badge>}
                    {data.can_manage && editing !== p.id && <Button type="button" size="sm" variant="outline" onClick={() => setEditing(p.id)}>Editar</Button>}
                  </span>
                </div>
                {editing !== p.id && Object.keys(p.targets).length > 0 && <p className="text-xs text-muted-foreground">{Object.entries(p.targets).map(([k, r]) => `${TARGET_LABEL[k] ?? k}: ${fmtTarget(r)}`).join(' · ')}</p>}
                {editing === p.id && <ProfileForm p={p} onDone={() => setEditing(null)} />}
              </li>
            ))}
          </ul>
        )}
        {data.can_manage && (
          <>
            <h3 className="pt-2 font-semibold">Modelos da plataforma</h3>
            <ul aria-label="Modelos de perfil" className="grid gap-2 sm:grid-cols-2">
              {platform.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm">
                  <span className="min-w-0"><span className="font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.reference ?? SEGMENT_LABEL[p.segment]}</span></span>
                  <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={`Copiar ${p.name}`} onClick={() => run(() => copyProfile(data.organization.id, p.id), 'Perfil copiado: revise as metas com a RT.', (id) => id && setEditing(id))}><Copy className="size-4" /> Copiar</Button>
                </li>
              ))}
            </ul>
            <form aria-label="Novo perfil" className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => createProfile(data.organization.id, np), 'Perfil criado.', (id) => { setNp({ name: '', segment: 'pat' }); if (id) setEditing(id); }); }}>
              <div className="space-y-1.5"><Label htmlFor="np-name">Novo perfil</Label><Input id="np-name" maxLength={120} value={np.name} placeholder="Ex.: Hospital — dieta branda" onChange={(e) => setNp({ ...np, name: e.target.value })} /></div>
              <select aria-label="Público do novo perfil" className={`${SELECT} w-auto`} value={np.segment} onChange={(e) => setNp({ ...np, segment: e.target.value as Segment })}>{(Object.keys(SEGMENT_LABEL) as Segment[]).map((s) => <option key={s} value={s}>{SEGMENT_LABEL[s]}</option>)}</select>
              <Button type="submit" variant="outline" disabled={pending}>Criar perfil</Button>
            </form>
          </>
        )}
      </section>

      <section aria-labelledby="regras" className="space-y-3">
        <h2 id="regras" className="font-display text-xl font-semibold">Regras do contrato</h2>
        <p className="text-sm text-muted-foreground">Viram avisos no cardápio de todas as unidades (ou só nos cardápios do perfil escolhido).</p>
        {data.rules.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma regra.</p> : (
          <ul aria-label="Regras do contrato" className="divide-y divide-border rounded-2xl border border-border bg-card text-sm">
            {data.rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>{ruleText(r)}<span className="block text-xs text-muted-foreground">{RULE_KIND_LABEL[r.kind]}{r.profile_name ? ` · só no perfil ${r.profile_name}` : ' · todos os cardápios'}{r.note ? ` · ${r.note}` : ''}</span></span>
                {data.can_manage && <Button type="button" size="sm" variant="ghost" aria-label={`Remover regra ${ruleText(r)}`} disabled={pending} onClick={() => run(() => deactivateRule(r.id), 'Regra removida.')}><Trash2 className="size-4" /></Button>}
              </li>
            ))}
          </ul>
        )}
        {data.can_manage && (
          <form aria-label="Nova regra" className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => createRule(data.organization.id, ruleBody()), 'Regra criada.'); }}>
            <div className="space-y-1.5"><Label htmlFor="rl-kind">Tipo de regra</Label>
              <select id="rl-kind" className={SELECT} value={rule.kind} onChange={(e) => setRule({ ...rule, kind: e.target.value })}>{Object.entries(RULE_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="rl-profile">Vale para</Label>
              <select id="rl-profile" className={SELECT} value={rule.profile_id} onChange={(e) => setRule({ ...rule, profile_id: e.target.value })}><option value="">Todos os cardápios</option>{mine.map((p) => <option key={p.id} value={p.id}>Perfil {p.name}</option>)}</select>
            </div>
            {(rule.kind === 'vetoed_ingredient' || rule.kind === 'max_per_week') && (
              <div className="space-y-1.5"><Label htmlFor="rl-ing">Insumo{rule.kind === 'max_per_week' ? ' (ou deixe vazio e use a categoria)' : ''}</Label>
                <select id="rl-ing" className={SELECT} value={rule.ingredient_id} onChange={(e) => setRule({ ...rule, ingredient_id: e.target.value })}><option value="">—</option>{data.ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
              </div>
            )}
            {(rule.kind === 'vetoed_category' || (rule.kind === 'max_per_week' && !rule.ingredient_id)) && (
              <div className="space-y-1.5"><Label htmlFor="rl-cat">Categoria da preparação</Label>
                <select id="rl-cat" className={SELECT} value={rule.sheet_category} onChange={(e) => setRule({ ...rule, sheet_category: e.target.value })}>{(Object.keys(SHEET_CATEGORY_LABEL) as SheetCategory[]).map((c) => <option key={c} value={c}>{SHEET_CATEGORY_LABEL[c]}</option>)}</select>
              </div>
            )}
            {rule.kind === 'required_daily' && (
              <div className="space-y-1.5"><Label htmlFor="rl-slot">Posição obrigatória</Label>
                <select id="rl-slot" className={SELECT} value={rule.slot} onChange={(e) => setRule({ ...rule, slot: e.target.value })}>{SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}</select>
              </div>
            )}
            {(rule.kind === 'required_daily' || rule.kind === 'cost_ceiling') && (
              <div className="space-y-1.5"><Label htmlFor="rl-service">Serviço</Label>
                <select id="rl-service" className={SELECT} value={rule.service} onChange={(e) => setRule({ ...rule, service: e.target.value })}><option value="">Todos</option>{SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}</select>
              </div>
            )}
            {rule.kind === 'max_per_week' && <div className="space-y-1.5"><Label htmlFor="rl-max">Máximo por semana</Label><Input id="rl-max" inputMode="numeric" value={rule.max_count} onChange={(e) => setRule({ ...rule, max_count: e.target.value })} /></div>}
            {rule.kind === 'cost_ceiling' && <div className="space-y-1.5"><Label htmlFor="rl-cost">Teto por refeição (R$)</Label><Input id="rl-cost" inputMode="decimal" value={rule.cost} onChange={(e) => setRule({ ...rule, cost: e.target.value })} /></div>}
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="rl-note">Observação (opcional)</Label><Input id="rl-note" maxLength={500} value={rule.note} onChange={(e) => setRule({ ...rule, note: e.target.value })} /></div>
            <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Criar regra</Button></div>
          </form>
        )}
      </section>
      {msg && <p role={msg.error ? 'alert' : 'status'} className={msg.error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{msg.text}</p>}
    </div>
  );
}
