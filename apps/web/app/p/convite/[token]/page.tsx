import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { AcceptLoggedIn, CreatePasswordForm } from '@/components/patient-area/invite-accept';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { openInvite } from '@/lib/patient-area/actions';

// Página pública: o token do link é a credencial do convite. Não indexar nem guardar em cache.
export const metadata: Metadata = { title: 'Convite para a área do paciente', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PatientInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [result, user] = await Promise.all([openInvite(token), getCurrentUser()]);
  const data = result.ok ? result.data : null;
  const color = data?.practice?.brand_color ?? undefined;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border/60" style={color ? { borderTop: `4px solid ${color}` } : undefined}>
        <div className="mx-auto max-w-md px-5 py-4">
          <p className="font-display text-lg font-semibold" style={color ? { color } : undefined}>{data?.practice?.name ?? 'Rafanutri'}</p>
          {data?.professional?.name && (
            <p className="text-sm text-muted-foreground">{data.professional.name}{data.professional.crn ? ` · ${data.professional.crn}` : ''}</p>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-6 px-5 py-8">
        {!data ? (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Área do paciente</h1>
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>{!result.ok && result.reason === 'error' ? 'Não foi possível abrir agora' : 'Convite indisponível'}</AlertTitle>
              <AlertDescription>
                {!result.ok && result.reason === 'error' ? 'Tente de novo em instantes.' : 'Este convite expirou, já foi usado ou foi cancelado. Peça um novo ao seu nutricionista.'}
              </AlertDescription>
            </Alert>
          </>
        ) : (
          <>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">{data.patient_first_name ? `Olá, ${data.patient_first_name}!` : 'Olá!'}</h1>
              <p className="mt-2 text-muted-foreground">
                {data.professional?.name ?? 'Seu nutricionista'} convidou você para a área do paciente: o plano alimentar e as orientações ficam no seu celular.
              </p>
            </div>
            {data.account_exists ? (
              <AcceptLoggedIn token={token} loggedIn={Boolean(user)} />
            ) : (
              <CreatePasswordForm token={token} email={data.email} />
            )}
            <p className="text-xs text-muted-foreground">Seus dados ficam visíveis só para o seu nutricionista. Convite válido até {new Date(data.expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</p>
          </>
        )}
      </main>
    </div>
  );
}
