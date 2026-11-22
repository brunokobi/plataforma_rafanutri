'use client';

import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteFeeding, saveFeeding, saveMyFeeding } from '@/lib/maternal/actions';
import { isSeriousReaction, REACTION_LABEL, type ChecklistItem } from '@/lib/maternal/feeding';
import type { FeedingKind, Reaction } from '@/lib/maternal/types';
import { isoToBR as dateBR } from '@/lib/format/date';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/** Quem grava: o nutricionista (ficha) ou o responsável (app do paciente). */
export type FeedingMode = { kind: 'pro'; patientId: string } | { kind: 'app'; recordId: string };

/** RN-116 — Checklist de alergênicos ou de texturas, com registro de introdução e de reação. */
export function FeedingChecklist({ kind, title, items, mode }: { kind: FeedingKind; title: string; items: ChecklistItem[]; mode: FeedingMode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      <ul className="divide-y rounded-lg border">
        {items.map((i) => <ChecklistRow key={i.code} kind={kind} item={i} mode={mode} />)}
      </ul>
    </section>
  );
}

function ChecklistRow({ kind, item, mode }: { kind: FeedingKind; item: ChecklistItem; mode: FeedingMode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const r = item.record;
  const [date, setDate] = useState(r?.introduced_on ?? today());
  const [reaction, setReaction] = useState<Reaction>(r?.reaction ?? 'none');
  const [notes, setNotes] = useState(r?.notes ?? '');
  const serious = r ? isSeriousReaction(r.reaction) : false;

  function save() {
    setError(null);
    start(async () => {
      const input = { introduced_on: date, reaction: kind === 'allergen' ? reaction : 'none', notes: notes.trim() || null };
      const res = mode.kind === 'pro' ? await saveFeeding(mode.patientId, kind, item.code, input) : await saveMyFeeding(mode.recordId, kind, item.code, input);
      if (!res.ok) return setError(Object.values(res.fields ?? {})[0] ?? res.message);
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (mode.kind !== 'pro') return;
    start(async () => {
      const res = await deleteFeeding(mode.patientId, kind, item.code);
      if (!res.ok) return setError(res.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <li className={`space-y-2 p-3 ${serious ? 'bg-destructive/5' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {r ? <Check className="size-4 text-primary" aria-hidden="true" /> : <span className="size-4" aria-hidden="true" />}
        <span className="font-medium">{item.label}</span>
        {r ? (
          <>
            <span className="text-sm text-muted-foreground">desde {dateBR(r.introduced_on)}</span>
            {kind === 'allergen' && (
              <Badge variant={serious ? 'destructive' : 'outline'}>
                {serious && <AlertTriangle className="size-3" aria-hidden="true" />}
                {REACTION_LABEL[r.reaction]}
              </Badge>
            )}
            {r.by_guardian && <span className="text-xs text-muted-foreground">(registrado pelo responsável)</span>}
          </>
        ) : item.due ? (
          <Badge variant="secondary">Já pode oferecer</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">a partir de {item.fromMonths} meses</span>
        )}
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${r ? 'Editar' : 'Registrar'} ${item.label}`}>
          {r ? 'Editar' : 'Registrar'}
        </Button>
      </div>
      {r?.notes && !open && <p className="pl-6 text-sm text-muted-foreground">{r.notes}</p>}
      {!r && !open && <p className="pl-6 text-xs text-muted-foreground">{item.tip}</p>}
      {open && (
        <div className="space-y-3 rounded-md bg-muted/40 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`fd-${kind}-${item.code}`}>{kind === 'allergen' ? 'Primeira vez' : 'Desde'}</Label>
              <Input id={`fd-${kind}-${item.code}`} type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </div>
            {kind === 'allergen' && (
              <div className="space-y-1">
                <Label htmlFor={`fr-${item.code}`}>Reação</Label>
                <select id={`fr-${item.code}`} value={reaction} onChange={(e) => setReaction(e.target.value as Reaction)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30">
                  {(Object.keys(REACTION_LABEL) as Reaction[]).map((k) => <option key={k} value={k}>{REACTION_LABEL[k]}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor={`fn-${kind}-${item.code}`}>Observação</Label>
              <Input id={`fn-${kind}-${item.code}`} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder={kind === 'allergen' ? 'Ex.: manchas na pele' : 'Opcional'} />
            </div>
          </div>
          {mode.kind === 'app' && kind === 'allergen' && isSeriousReaction(reaction) && (
            <p className="text-sm text-destructive">Seu nutricionista será avisado. Em caso de falta de ar, inchaço no rosto ou vômitos repetidos, procure atendimento de urgência.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={save}>{pending && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
            {r && mode.kind === 'pro' && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={remove}>Apagar registro</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      )}
    </li>
  );
}
