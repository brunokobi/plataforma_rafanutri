'use client';

import { Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createGuardian, deleteGuardian, updateGuardian } from '@/lib/maternal/actions';
import { CONSENT_LABEL, RELATIONSHIP_LABEL } from '@/lib/maternal/feeding';
import type { ConsentMethod, Guardian, Relationship } from '@/lib/maternal/types';

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30';
const dateBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/**
 * RN-118 — Responsáveis legais do menor e o consentimento (LGPD, art. 14: consentimento específico de ao menos
 * um dos pais ou do responsável legal). O app do paciente menor só é liberado para um responsável com consentimento.
 */
export function GuardiansPanel({ patientId, guardians }: { patientId: string; guardians: Guardian[] }) {
  const consented = guardians.some((g) => g.consent_at);
  return (
    <section aria-labelledby="guardians-title" className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="guardians-title" className="font-medium">Responsáveis legais</h3>
        {consented ? <Badge variant="outline"><ShieldCheck className="size-3" aria-hidden="true" /> Consentimento registrado</Badge> : <Badge variant="secondary"><ShieldAlert className="size-3" aria-hidden="true" /> Sem consentimento</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        Para tratar os dados de um menor, a LGPD (art. 14) pede o consentimento de ao menos um dos pais ou do responsável legal. O app do paciente é liberado para um responsável com consentimento, pelo convite acima.
      </p>
      {guardians.length > 0 && <ul className="divide-y rounded-md border">{guardians.map((g) => <GuardianRow key={g.id} patientId={patientId} g={g} />)}</ul>}
      <NewGuardianForm patientId={patientId} />
    </section>
  );
}

function GuardianRow({ patientId, g }: { patientId: string; g: Guardian }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<ConsentMethod>('in_person');
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.message ?? 'Não foi possível salvar agora.');
      router.refresh();
    });

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{g.full_name}</span>
        <span className="text-sm text-muted-foreground">{RELATIONSHIP_LABEL[g.relationship]}</span>
        {g.email && <span className="text-sm text-muted-foreground">· {g.email}</span>}
        {g.phone && <span className="text-sm text-muted-foreground">· {g.phone}</span>}
      </div>
      {g.consent_at ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          Consentimento em {dateBR(g.consent_at)} ({g.consent_method ? CONSENT_LABEL[g.consent_method].toLowerCase() : ''})
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateGuardian(patientId, g.id, { consent: null }))}>Retirar consentimento</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`gc-${g.id}`}>Forma do consentimento</Label>
            <select id={`gc-${g.id}`} value={method} onChange={(e) => setMethod(e.target.value as ConsentMethod)} className={SELECT}>
              {(Object.keys(CONSENT_LABEL) as ConsentMethod[]).map((k) => <option key={k} value={k}>{CONSENT_LABEL[k]}</option>)}
            </select>
          </div>
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => updateGuardian(patientId, g.id, { consent: method }))}>
            {pending && <Loader2 className="size-4 animate-spin" />}Registrar consentimento
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteGuardian(patientId, g.id))}>Remover responsável</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </li>
  );
}

function NewGuardianForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [rel, setRel] = useState<Relationship>('mother');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [method, setMethod] = useState<ConsentMethod>('in_person');

  if (!open) return <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Cadastrar responsável</Button>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createGuardian(patientId, { full_name: name, relationship: rel, email: email || null, phone: phone || null, ...(consent ? { consent: method } : {}) });
      if (!r.ok) return setError(Object.values(r.fields ?? {})[0] ?? r.message);
      setOpen(false);
      setName(''); setEmail(''); setPhone(''); setConsent(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md bg-muted/40 p-3" aria-label="Cadastrar responsável">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="gn-name">Nome</Label><Input id="gn-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="space-y-1">
          <Label htmlFor="gn-rel">Parentesco</Label>
          <select id="gn-rel" value={rel} onChange={(e) => setRel(e.target.value as Relationship)} className={SELECT}>
            {(Object.keys(RELATIONSHIP_LABEL) as Relationship[]).map((k) => <option key={k} value={k}>{RELATIONSHIP_LABEL[k]}</option>)}
          </select>
        </div>
        <div className="space-y-1"><Label htmlFor="gn-email">E-mail (para o app)</Label><Input id="gn-email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="gn-phone">Telefone</Label><Input id="gn-phone" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="size-4" />
        O responsável consentiu com o tratamento dos dados do menor
      </label>
      {consent && (
        <div className="max-w-xs space-y-1">
          <Label htmlFor="gn-method">Forma do consentimento</Label>
          <select id="gn-method" value={method} onChange={(e) => setMethod(e.target.value as ConsentMethod)} className={SELECT}>
            {(Object.keys(CONSENT_LABEL) as ConsentMethod[]).map((k) => <option key={k} value={k}>{CONSENT_LABEL[k]}</option>)}
          </select>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}
