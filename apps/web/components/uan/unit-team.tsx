'use client';

import { Check, ClipboardCopy, Loader2, MessageCircle, UserPlus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeUnitMember, createUnitInvite, revokeUnitInvite } from '@/lib/uan/actions';
import { UNIT_ROLE_HINT, UNIT_ROLE_LABEL, type UnitInvite, type UnitMember, type UnitRole } from '@/lib/uan/types';

const SELECT = 'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const nameOf = (m: UnitMember) => [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || 'Sem nome';

/** Mensagem do convite da equipe para o WhatsApp. */
export function teamWhatsappLink(unitName: string, role: UnitRole, link: string): string {
  const text = `Olá! Você foi convidado(a) para a equipe da unidade ${unitName} como ${UNIT_ROLE_LABEL[role]} na Rafanutri. Crie seu acesso por este link (vale 7 dias, uso único): ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Equipe da unidade (RN-220): convite por link, troca de papel e remoção. */
export function UnitTeam({
  unitId,
  unitName,
  unitActive,
  members,
  invites,
  invitableRoles,
}: {
  unitId: string;
  unitName: string;
  unitActive: boolean;
  members: UnitMember[];
  invites: UnitInvite[];
  invitableRoles: UnitRole[];
}) {
  const router = useRouter();
  const [role, setRole] = useState<UnitRole>(invitableRoles.includes('cook') ? 'cook' : (invitableRoles[0] ?? 'cook'));
  const [label, setLabel] = useState('');
  const [sent, setSent] = useState<{ link: string; expires_at: string; role: UnitRole } | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const can = (r: UnitRole) => invitableRoles.includes(r);

  const invite = () => {
    setMessage(null);
    setCopied(false);
    startTransition(async () => {
      const r = await createUnitInvite(unitId, role, label);
      if (r.ok) {
        setSent({ link: r.link, expires_at: r.expires_at, role });
        setLabel('');
        router.refresh();
      } else setMessage(r.message);
    });
  };
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, done?: string) => {
    setMessage(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        if (done) setMessage(done);
        router.refresh();
      } else setMessage(r.message ?? 'Não foi possível salvar agora.');
    });
  };

  return (
    <section aria-labelledby="equipe" className="space-y-4">
      <h2 id="equipe" className="font-display text-2xl font-semibold tracking-tight">Equipe</h2>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém na equipe ainda. Gere um link de convite abaixo e envie pelo WhatsApp.</p>
      ) : (
        <ul aria-label="Membros da equipe" className="divide-y divide-border rounded-2xl border border-border bg-card">
          {members.map((m) => (
            <li key={`${m.user_id}-${m.role}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{nameOf(m)}{m.is_self && <span className="font-normal text-muted-foreground"> (você)</span>}</p>
                {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
              </div>
              {can(m.role) && !m.is_self ? (
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Papel de ${nameOf(m)}`}
                    className={SELECT}
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => {
                      const next = e.target.value as UnitRole;
                      run(() => changeUnitMember(unitId, m.user_id, m.role, next), `${nameOf(m)} agora é ${UNIT_ROLE_LABEL[next]}.`);
                    }}
                  >
                    {invitableRoles.map((r) => <option key={r} value={r}>{UNIT_ROLE_LABEL[r]}</option>)}
                  </select>
                  <Button
                    type="button" variant="ghost" size="icon" disabled={pending}
                    aria-label={`Remover ${nameOf(m)} da equipe`}
                    onClick={() => {
                      if (!window.confirm(`Remover ${nameOf(m)} (${UNIT_ROLE_LABEL[m.role]}) da unidade ${unitName}?`)) return;
                      run(() => changeUnitMember(unitId, m.user_id, m.role, null), `${nameOf(m)} saiu da equipe.`);
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <Badge variant="secondary">{UNIT_ROLE_LABEL[m.role]}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {invitableRoles.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 font-semibold"><UserPlus className="size-4" aria-hidden="true" /> Convidar para a equipe</h3>
          {!unitActive ? (
            <p className="text-sm text-muted-foreground">Ative a unidade para convidar a equipe.</p>
          ) : (
            <form
              aria-label="Convidar para a equipe"
              className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                invite();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Papel</Label>
                <select id="invite-role" className={`${SELECT} w-full`} value={role} onChange={(e) => setRole(e.target.value as UnitRole)}>
                  {invitableRoles.map((r) => <option key={r} value={r}>{UNIT_ROLE_LABEL[r]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-label">Para quem (opcional)</Label>
                <Input id="invite-label" value={label} maxLength={120} placeholder="Ex.: Maria, turno da manhã" onChange={(e) => setLabel(e.target.value)} />
              </div>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Gerar link</Button>
              <p className="text-xs text-muted-foreground sm:col-span-3">{UNIT_ROLE_HINT[role]}</p>
            </form>
          )}

          {sent && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-3">
              <input readOnly value={sent.link} aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button" size="sm"
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
                  <a href={teamWhatsappLink(unitName, sent.role, sent.link)} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> Enviar por WhatsApp</a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Link de {UNIT_ROLE_LABEL[sent.role]}, válido até {day(sent.expires_at)}, uso único. Ele só aparece agora: quem tiver o link entra na equipe.
              </p>
            </div>
          )}

          {invites.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Convites pendentes</h4>
              <ul aria-label="Convites pendentes" className="divide-y divide-border rounded-xl border border-border">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-sm">
                    <span>
                      {UNIT_ROLE_LABEL[i.role]}
                      {i.label && <span className="text-muted-foreground"> · {i.label}</span>}
                      <span className="text-muted-foreground"> · até {day(i.expires_at)}</span>
                    </span>
                    {can(i.role) && (
                      <Button
                        type="button" variant="ghost" size="sm" disabled={pending}
                        onClick={() => run(() => revokeUnitInvite(unitId, i.id), 'Convite cancelado.')}
                      >
                        Cancelar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
