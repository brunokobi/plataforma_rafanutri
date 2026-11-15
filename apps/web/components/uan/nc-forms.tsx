'use client';

import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resizeImage } from '@/lib/recipes/resize-image';
import { SEVERITY_LABEL, type NcSeverity } from '@/lib/uan/checklists';
import { addPlan, closeNc, completePlan, deletePlan, openNc, type PlanInput } from '@/lib/uan/nc-actions';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const TEXTAREA = 'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm';
const FILE = 'block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium';
type Err = { message: string; fields?: Record<string, string> } | null;
const fieldMsg = (e: Err) => (e?.fields ? (Object.values(e.fields)[0] ?? e.message) : e?.message);

/** Foto escolhida, já reduzida no aparelho (data URL). */
function usePhoto() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return setPhoto(null);
    setBusy(true);
    try {
      setPhoto(await resizeImage(file, 1600, 0.8));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler a foto.');
    } finally {
      setBusy(false);
    }
  };
  return { photo, error, busy, pick, reset: () => setPhoto(null) };
}

/** Abertura manual de não conformidade (qualquer pessoa que executa na unidade). */
export function NewNc({ unitId }: { unitId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: '', description: '', severity: 'medium' as NcSeverity });
  const [error, setError] = useState<Err>(null);
  const [pending, startTransition] = useTransition();
  const ph = usePhoto();
  if (!open) return <Button type="button" onClick={() => setOpen(true)}><Plus className="size-4" /> Nova não conformidade</Button>;
  return (
    <form
      aria-label="Nova não conformidade"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await openNc(unitId, { ...v, image: ph.photo });
          if (!r.ok) return setError(r);
          router.push(`/app/uan/nao-conformidades/${r.id}`);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="nc-title">O que foi encontrado</Label>
        <Input id="nc-title" maxLength={500} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} aria-invalid={Boolean(error?.fields?.title)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nc-desc">Detalhes (opcional)</Label>
        <textarea id="nc-desc" className={TEXTAREA} maxLength={2000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="nc-sev">Gravidade</Label>
          <select id="nc-sev" className={SELECT} value={v.severity} onChange={(e) => setV({ ...v, severity: e.target.value as NcSeverity })}>
            {(['critical', 'high', 'medium', 'low'] as NcSeverity[]).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">Prazo: crítica 24 h, alta 72 h, média 7 dias, baixa 15 dias.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nc-photo">Foto (opcional)</Label>
          <input id="nc-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className={FILE} onChange={(e) => void ph.pick(e.target.files?.[0])} />
          {ph.error && <p className="text-xs text-destructive">{ph.error}</p>}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{fieldMsg(error)}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || ph.busy}>{pending && <Loader2 className="size-4 animate-spin" />} Registrar</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}

const EMPTY_PLAN: PlanInput = { what: '', why: '', where: '', due_date: '', who_user: null, who_text: '', how: '', how_much: '' };

/** Plano de ação 5W2H. */
export function PlanForm({ ncId, team, defaultWhy }: { ncId: string; team: Array<{ id: string; name: string }>; defaultWhy?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<PlanInput>({ ...EMPTY_PLAN, why: defaultWhy ?? '' });
  const [error, setError] = useState<Err>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof PlanInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  if (!open) return <Button type="button" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" /> Plano de ação (5W2H)</Button>;
  return (
    <form
      aria-label="Plano de ação"
      className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await addPlan(ncId, v);
          if (!r.ok) return setError(r);
          setV({ ...EMPTY_PLAN, why: defaultWhy ?? '' });
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="pl-what">O quê (ação)</Label>
        <Input id="pl-what" maxLength={500} value={v.what} onChange={set('what')} aria-invalid={Boolean(error?.fields?.what)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="pl-why">Por quê (causa)</Label>
        <Input id="pl-why" maxLength={1000} value={v.why} onChange={set('why')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pl-who">Quem</Label>
        <select id="pl-who" className={SELECT} value={v.who_user ?? ''} onChange={(e) => setV({ ...v, who_user: e.target.value || null })} aria-invalid={Boolean(error?.fields?.who_user)}>
          <option value="">Outra pessoa (escrever)</option>
          {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {!v.who_user && <Input aria-label="Nome do responsável" placeholder="Ex.: empresa de manutenção" maxLength={120} value={v.who_text} onChange={set('who_text')} />}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pl-when">Quando (prazo)</Label>
        <Input id="pl-when" type="date" value={v.due_date} onChange={set('due_date')} aria-invalid={Boolean(error?.fields?.due_date)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pl-where">Onde</Label>
        <Input id="pl-where" maxLength={200} value={v.where} onChange={set('where')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pl-much">Quanto (R$, opcional)</Label>
        <Input id="pl-much" inputMode="decimal" value={v.how_much} onChange={set('how_much')} aria-invalid={Boolean(error?.fields?.how_much)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="pl-how">Como</Label>
        <textarea id="pl-how" className={TEXTAREA} maxLength={1000} value={v.how} onChange={set('how')} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{fieldMsg(error)}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar plano</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}

/** Concluir (com nota opcional) ou apagar uma ação. */
export function PlanActions({ ncId, planId, canComplete, canDelete, what }: { ncId: string; planId: string; canComplete: boolean; canDelete: boolean; what: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.message ?? 'Não foi possível salvar.');
    });
  return (
    <div className="space-y-2">
      {asking ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor={`done-${planId}`}>O que foi feito (opcional)</Label>
            <Input id={`done-${planId}`} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => completePlan(ncId, planId, note))}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canComplete && <Button type="button" size="sm" variant="secondary" onClick={() => setAsking(true)}><Check className="size-4" /> Marcar como feita</Button>}
          {canDelete && (
            <Button
              type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} aria-label={`Apagar a ação ${what}`}
              onClick={() => { if (window.confirm('Apagar esta ação?')) run(() => deletePlan(ncId, planId)); }}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Fechamento com verificação de eficácia: nota e foto obrigatórias. */
export function CloseNc({ ncId }: { ncId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<Err>(null);
  const [pending, startTransition] = useTransition();
  const ph = usePhoto();
  return (
    <form
      aria-label="Fechar não conformidade"
      className="space-y-3 rounded-2xl border border-emerald-600/40 bg-emerald-50 p-4 dark:bg-emerald-950/30"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await closeNc(ncId, note, ph.photo);
          if (!r.ok) return setError(r);
          router.refresh();
        });
      }}
    >
      <h3 className="font-semibold">Verificar a eficácia e fechar</h3>
      <div className="space-y-1.5">
        <Label htmlFor="close-note">Como foi verificado</Label>
        <textarea id="close-note" className={TEXTAREA} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(error?.fields?.note)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="close-photo">Foto da evidência (obrigatória)</Label>
        <input id="close-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className={FILE} onChange={(e) => void ph.pick(e.target.files?.[0])} aria-invalid={Boolean(error?.fields?.image)} />
        {ph.error && <p className="text-xs text-destructive">{ph.error}</p>}
        {ph.photo && <p className="text-xs text-muted-foreground">Foto pronta para enviar.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{fieldMsg(error)}</p>}
      <Button type="submit" disabled={pending || ph.busy}>{pending && <Loader2 className="size-4 animate-spin" />} Fechar não conformidade</Button>
    </form>
  );
}
