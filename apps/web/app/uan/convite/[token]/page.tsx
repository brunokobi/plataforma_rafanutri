import { AlertCircle, ChefHat } from 'lucide-react';
import type { Metadata } from 'next';
import { Logo } from '@/components/brand/logo';
import { AcceptStaffInvite, StaffSignupForm } from '@/components/uan/invite-accept';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { openUnitInvite } from '@/lib/uan/actions';
import { UNIT_KIND_LABEL, UNIT_ROLE_HINT, UNIT_ROLE_LABEL } from '@/lib/uan/types';

// Página pública: o token do link é a credencial do convite. Não indexar nem guardar em cache.
export const metadata: Metadata = { title: 'Convite para a equipe', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function UnitInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [result, user] = await Promise.all([openUnitInvite(token), getCurrentUser()]);
  const data = result.ok ? result.data : null;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-md items-center px-5"><Logo href="/" /></div>
      </header>
      <main className="mx-auto max-w-md space-y-6 px-5 py-8">
        {!data ? (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Convite para a equipe</h1>
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>{!result.ok && result.reason === 'error' ? 'Não foi possível abrir agora' : 'Convite indisponível'}</AlertTitle>
              <AlertDescription>
                {!result.ok && result.reason === 'error'
                  ? 'Tente de novo em instantes.'
                  : 'Este convite expirou, já foi usado ou foi cancelado. Peça um novo ao responsável pela unidade.'}
              </AlertDescription>
            </Alert>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <ChefHat className="size-6 text-primary" aria-hidden="true" />
              <h1 className="font-display text-2xl font-semibold tracking-tight">Você foi convidado(a) para a equipe</h1>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{data.organization}</span> chamou você para a unidade{' '}
                <span className="font-medium text-foreground">{data.unit}</span> ({UNIT_KIND_LABEL[data.kind]}) como{' '}
                <span className="font-medium text-foreground">{UNIT_ROLE_LABEL[data.role]}</span>.
              </p>
              <p className="text-sm text-muted-foreground">{UNIT_ROLE_HINT[data.role]}</p>
            </div>
            {user ? (
              <AcceptStaffInvite token={token} email={user.email} />
            ) : (
              <StaffSignupForm token={token} defaultName={data.label ?? undefined} />
            )}
            <p className="text-xs text-muted-foreground">
              Você terá acesso só a esta unidade, nunca a dados de pacientes ou financeiros. Convite válido até{' '}
              {new Date(data.expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}, uso único.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
