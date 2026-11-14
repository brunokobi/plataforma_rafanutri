'use client';

import { Loader2, MessageCircle, Plus, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { convertLead, createLead, moveLead } from '@/lib/crm/actions';
import { LEAD_STAGE_LABEL, PATIENT_STAGE_LABEL, SOURCE_LABEL, type Board, type BoardPatient, type Lead, type LeadSource, type PatientStage } from '@/lib/crm/types';
import { cn } from '@/lib/utils';

type LeadColumn = 'new' | 'contacted' | 'lost';
const LEAD_COLUMNS: LeadColumn[] = ['new', 'contacted', 'lost'];
const PATIENT_COLUMNS: PatientStage[] = ['scheduled', 'first_visit', 'follow_up', 'inactive'];
const dateBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : null);

/** RN-056 — Funil: leads (arrastar entre colunas ou usar "Mover para") e pacientes por etapa (automática). */
export function CrmBoard({ board }: { board: Board }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LeadColumn | null>(null);

  function move(lead: Lead, to: LeadColumn) {
    if (lead.stage === to) return;
    let note: string | undefined;
    if (to === 'lost') {
      note = window.prompt(`Por que ${lead.full_name} não seguiu? (vai no histórico)`)?.trim();
      if (!note) return;
    }
    setFeedback(null);
    start(async () => {
      const r = await moveLead(lead.id, to, note);
      setFeedback(r.ok ? { ok: true, text: `${lead.full_name}: ${LEAD_STAGE_LABEL[to]}.` } : { ok: false, text: r.message });
      if (r.ok) router.refresh();
    });
  }
  function convert(lead: Lead) {
    if (!window.confirm(`Cadastrar ${lead.full_name} como paciente? Ocupa uma vaga de paciente ativo.`)) return;
    setFeedback(null);
    start(async () => {
      const r = await convertLead(lead.id);
      if (!r.ok) return setFeedback({ ok: false, text: r.message });
      router.push(`/app/pacientes/${r.patientId}`);
    });
  }

  const byStage = (s: LeadColumn) => board.leads.filter((l) => l.stage === s);
  const patientsBy = (s: PatientStage) => board.patients.filter((p) => p.crm_stage === s);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Arraste o lead entre as colunas (ou use &ldquo;Mover para&rdquo;). As etapas dos pacientes mudam sozinhas com as consultas.</p>
        {!adding && <Button type="button" className="ml-auto" onClick={() => { setAdding(true); setFeedback(null); }}><Plus className="size-4" /> Novo lead</Button>}
      </div>
      {adding && <LeadForm pending={pending} onCancel={() => setAdding(false)} onSubmit={(v) => start(async () => {
        const r = await createLead(v);
        setFeedback(r.ok ? { ok: true, text: `Lead ${v.full_name} cadastrado.` } : { ok: false, text: r.message });
        if (r.ok) { setAdding(false); router.refresh(); }
      })} />}
      {feedback && <p role="status" className={feedback.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>{feedback.text}</p>}

      <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-7">
        {LEAD_COLUMNS.map((col) => (
          <section key={col} aria-label={LEAD_STAGE_LABEL[col]}
            onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(col); } }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const l = board.leads.find((x) => x.id === dragging); setDragging(null); if (l) move(l, col); }}
            className={cn('min-w-56 space-y-2 rounded-2xl border border-dashed border-border p-3', over === col && 'border-primary bg-primary/5')}>
            <h2 className="flex items-center justify-between text-sm font-semibold">{LEAD_STAGE_LABEL[col]} <span className="text-muted-foreground">{byStage(col).length}</span></h2>
            <ul className="space-y-2">
              {byStage(col).map((l) => (
                <li key={l.id} draggable onDragStart={() => setDragging(l.id)} onDragEnd={() => setDragging(null)} aria-label={l.full_name}
                  className="cursor-grab space-y-1.5 rounded-xl border border-border bg-card p-3 text-sm shadow-sm active:cursor-grabbing">
                  <p className="font-medium">{l.full_name}</p>
                  <p className="text-xs text-muted-foreground">{SOURCE_LABEL[l.source]}{l.phone ? ` · ${l.phone}` : ''}</p>
                  {l.stage === 'lost' && l.lost_reason && <p className="text-xs italic text-muted-foreground">“{l.lost_reason}”</p>}
                  <div className="flex flex-wrap items-center gap-1">
                    <select aria-label={`Mover ${l.full_name} para`} value="" disabled={pending} onChange={(e) => e.target.value && move(l, e.target.value as LeadColumn)}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
                      <option value="">Mover para…</option>
                      {LEAD_COLUMNS.filter((c) => c !== l.stage).map((c) => <option key={c} value={c}>{LEAD_STAGE_LABEL[c]}</option>)}
                    </select>
                    {l.stage !== 'lost' && (
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={pending} onClick={() => convert(l)} aria-label={`Cadastrar ${l.full_name} como paciente`}>
                        <UserPlus className="size-3.5" /> Paciente
                      </Button>
                    )}
                    {l.phone && (
                      <a href={`https://wa.me/${l.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-md px-2 text-xs text-primary hover:bg-muted" aria-label={`WhatsApp de ${l.full_name}`}>
                        <MessageCircle className="size-3.5" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {PATIENT_COLUMNS.map((col) => (
          <section key={col} aria-label={PATIENT_STAGE_LABEL[col]} className="min-w-56 space-y-2 rounded-2xl border border-border bg-muted/30 p-3">
            <h2 className="flex items-center justify-between text-sm font-semibold">{PATIENT_STAGE_LABEL[col]} <span className="text-muted-foreground">{patientsBy(col).length}</span></h2>
            <ul className="space-y-2">
              {patientsBy(col).slice(0, 50).map((p) => <PatientCard key={p.id} p={p} />)}
            </ul>
            {patientsBy(col).length > 50 && <p className="text-xs text-muted-foreground">+ {patientsBy(col).length - 50} pacientes</p>}
          </section>
        ))}
      </div>
      {board.without_visit > 0 && <p className="text-sm text-muted-foreground">{board.without_visit} paciente{board.without_visit > 1 ? 's' : ''} ativo{board.without_visit > 1 ? 's' : ''} ainda sem consulta marcada.</p>}
    </div>
  );
}

function PatientCard({ p }: { p: BoardPatient }) {
  return (
    <li className="space-y-0.5 rounded-xl border border-border bg-card p-3 text-sm">
      <Link href={`/app/pacientes/${p.id}`} className="font-medium hover:underline">{p.full_name}</Link>
      <p className="text-xs text-muted-foreground">
        {p.next_visit ? `Próxima: ${dateBR(p.next_visit)}` : p.last_visit ? `Última: ${dateBR(p.last_visit)}` : ''}
        {p.lead_source ? ` · ${SOURCE_LABEL[p.lead_source]}` : ''}
      </p>
    </li>
  );
}

function LeadForm({ pending, onSubmit, onCancel }: { pending: boolean; onSubmit: (v: { full_name: string; phone: string; email: string; source: LeadSource; notes: string }) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<LeadSource>('instagram');
  return (
    <form aria-label="Novo lead" className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4"
      onSubmit={(e) => { e.preventDefault(); onSubmit({ full_name: name, phone, email: '', source, notes: '' }); }}>
      <div className="space-y-1.5"><Label htmlFor="lead-name">Nome</Label><Input id="lead-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="lead-phone">Telefone (opcional)</Label><Input id="lead-phone" inputMode="tel" placeholder="(31) 99999-0000" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label htmlFor="lead-source">Origem</Label>
        <select id="lead-source" value={source} onChange={(e) => setSource(e.target.value as LeadSource)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
          {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((k) => <option key={k} value={k}>{SOURCE_LABEL[k]}</option>)}
        </select>
      </div>
      <div className="flex items-end justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar lead</Button>
      </div>
    </form>
  );
}
