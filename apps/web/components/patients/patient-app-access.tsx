'use client';

import { Check, ClipboardCopy, Loader2, MessageCircle, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GuardiansPanel } from '@/components/maternal/guardians';
import { RELATIONSHIP_LABEL } from '@/lib/maternal/feeding';
import { invitePatient, revokeAppAccess } from '@/lib/patient-area/actions';
import type { AppAccess } from '@/lib/patient-area/types';

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** Mensagem do convite para o WhatsApp. */
export function inviteWhatsappLink(phoneE164: string | null, firstName: string, link: string): string {
  const text = `Olá, ${firstName}! Seu plano alimentar e as orientações agora ficam na sua área do paciente. Crie seu acesso por este link (vale 7 dias): ${link}`;
  return `https://wa.me/${phoneE164 ? phoneE164.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`;
}

export function PatientAppAccess({ patientId, access, firstName, phone }: { patientId: string; access: AppAccess | null; firstName: string; phone: string | null }) {
  const router = useRouter();
  const consented = (access?.guardians ?? []).filter((g) => g.consent_at);
  const [guardianId, setGuardianId] = useState(consented[0]?.id ?? '');
  const [email, setEmail] = useState(access?.invite?.email ?? (access?.minor ? consented[0]?.email : access?.patient_email) ?? '');
  const [inviting, setInviting] = useState(false);
  const [sent, setSent] = useState<{ link: string; expires_at: string; sent: boolean } | null>(null);
  const [sendNow, setSendNow] = useState(true);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!access) {
    return (
      <section aria-labelledby="app-access" className="rounded-2xl border border-border bg-card p-5">
        <h2 id="app-access" className="font-semibold">Área do paciente</h2>
        <p className="mt-2 text-sm text-muted-foreground">Não foi possível carregar o acesso agora.</p>
      </section>
    );
  }

  const send = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await invitePatient(patientId, email, sendNow, access.minor ? guardianId || null : null);
      if (r.ok && r.data) {
        setSent(r.data);
        setInviting(false);
        router.refresh();
      } else if (!r.ok) setMessage(r.message);
    });
  };
  const revoke = () => {
    if (!window.confirm(`Revogar o acesso de ${firstName} à área do paciente? O convite pendente também é cancelado.`)) return;
    setMessage(null);
    startTransition(async () => {
      const r = await revokeAppAccess(patientId);
      if (r.ok) {
        setSent(null);
        router.refresh();
      } else setMessage(r.message);
    });
  };

  return (
    <section aria-labelledby="app-access" className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Smartphone className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2 id="app-access" className="font-semibold">Área do paciente</h2>
        {access.linked ? <Badge>Acesso ativo</Badge> : access.invite ? <Badge variant="secondary">Convite pendente</Badge> : <Badge variant="outline">Sem acesso</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        {access.linked
          ? `${firstName} entra com ${access.email}${access.activated_at ? ` desde ${day(access.activated_at)}` : ''} e vê o plano publicado.`
          : access.invite
            ? `Convite para ${access.invite.email}, válido até ${day(access.invite.expires_at)}. O link só aparece quando é gerado; se ele se perdeu, gere outro.`
            : `${firstName} ainda não tem acesso. A Rafanutri envia o convite por e-mail (ou pelo Telegram, se estiver ligado); no primeiro acesso, ${firstName} cria a própria senha.`}
      </p>

      {sent && (
        <div className="space-y-2 rounded-xl bg-muted/50 p-3">
          {sent.sent && <p className="text-sm font-medium text-primary">Convite enviado para {firstName}. Se quiser, copie o link abaixo e mande por outro canal.</p>}
          <input readOnly value={sent.link} aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button" variant="outline" size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(sent.link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? 'Copiado' : 'Copiar link'}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={inviteWhatsappLink(phone, firstName, sent.link)} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> Enviar por WhatsApp</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Válido até {day(sent.expires_at)}, uso único. Quem tiver o link cria o acesso: envie só para {firstName}.</p>
        </div>
      )}

      {access.minor && !access.linked && consented.length === 0 && (
        <p className="rounded-md bg-muted/60 p-2 text-sm">{firstName} é menor de idade: o app é liberado para um responsável. Cadastre o responsável e registre o consentimento abaixo antes de convidar.</p>
      )}
      {access.active && inviting && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {access.minor && (
            <div className="min-w-48 space-y-1.5">
              <Label htmlFor="app-guardian">Responsável</Label>
              <select
                id="app-guardian" value={guardianId}
                onChange={(e) => { setGuardianId(e.target.value); setEmail(consented.find((g) => g.id === e.target.value)?.email ?? ''); }}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30"
              >
                {consented.map((g) => <option key={g.id} value={g.id}>{g.full_name} ({RELATIONSHIP_LABEL[g.relationship]})</option>)}
              </select>
            </div>
          )}
          <div className="min-w-60 flex-1 space-y-1.5">
            <Label htmlFor="app-email">{access.minor ? 'E-mail do responsável' : `E-mail de acesso de ${firstName}`}</Label>
            <Input id="app-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />
            Enviar o convite agora
          </label>
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} {sendNow ? 'Enviar convite' : 'Gerar link'}</Button>
          <Button type="button" variant="ghost" onClick={() => setInviting(false)} disabled={pending}>Cancelar</Button>
        </form>
      )}
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}

      {!inviting && (
        <div className="flex flex-wrap gap-2">
          {access.active && !access.linked && (!access.minor || consented.length > 0) && (
            <Button
              type="button" size="sm" disabled={pending}
              onClick={() => {
                // Responsáveis podem ter sido cadastrados depois da primeira renderização
                if (access.minor && !consented.some((g) => g.id === guardianId)) {
                  setGuardianId(consented[0]?.id ?? '');
                  setEmail(consented[0]?.email ?? '');
                }
                setInviting(true);
              }}
            >
              {access.invite ? 'Gerar novo link' : 'Convidar para a área do paciente'}
            </Button>
          )}
          {(access.linked || access.invite) && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={revoke} disabled={pending}>
              {access.linked ? 'Revogar acesso' : 'Cancelar convite'}
            </Button>
          )}
          {!access.active && <p className="text-sm text-muted-foreground">Paciente arquivado não acessa a área do paciente.</p>}
        </div>
      )}
      {access.minor && <GuardiansPanel patientId={patientId} guardians={access.guardians ?? []} />}
    </section>
  );
}
