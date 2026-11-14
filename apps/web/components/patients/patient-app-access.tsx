'use client';

import { Check, ClipboardCopy, Loader2, MessageCircle, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [email, setEmail] = useState(access?.invite?.email ?? access?.patient_email ?? '');
  const [inviting, setInviting] = useState(false);
  const [sent, setSent] = useState<{ link: string; expires_at: string } | null>(null);
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
      const r = await invitePatient(patientId, email);
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
            : `${firstName} ainda não tem acesso. Gere o link e envie pelo WhatsApp: no primeiro acesso, ${firstName} cria a própria senha.`}
      </p>

      {sent && (
        <div className="space-y-2 rounded-xl bg-muted/50 p-3">
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

      {access.active && inviting && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="min-w-60 flex-1 space-y-1.5">
            <Label htmlFor="app-email">E-mail de acesso de {firstName}</Label>
            <Input id="app-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Gerar link</Button>
          <Button type="button" variant="ghost" onClick={() => setInviting(false)} disabled={pending}>Cancelar</Button>
        </form>
      )}
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}

      {!inviting && (
        <div className="flex flex-wrap gap-2">
          {access.active && !access.linked && (
            <Button type="button" size="sm" onClick={() => setInviting(true)} disabled={pending}>
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
    </section>
  );
}
