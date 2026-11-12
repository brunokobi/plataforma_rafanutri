import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { PublicAnamnesisForm } from '@/components/forms/public-anamnesis';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { loadPublicAnamnesis } from '@/lib/anamneses/public';

// Página pública (sem login): o token do link é a única credencial. Não indexar nem guardar em cache.
export const metadata: Metadata = { title: 'Anamnese', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PublicAnamnesisPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadPublicAnamnesis(token);
  const data = result.ok ? result.data : null;
  const color = data?.practice.brand_color ?? undefined;
  const expires = data ? new Date(data.expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : null;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border/60" style={color ? { borderTop: `4px solid ${color}` } : undefined}>
        <div className="mx-auto max-w-2xl px-5 py-4">
          <p className="font-display text-lg font-semibold" style={color ? { color } : undefined}>{data?.practice.name ?? 'Rafanutri'}</p>
          {data?.professional?.name && (
            <p className="text-sm text-muted-foreground">
              {data.professional.name}
              {data.professional.crn ? ` · ${data.professional.crn}` : ''}
            </p>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-8">
        {!data ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>{result.ok === false && result.reason === 'error' ? 'Não foi possível abrir agora' : 'Link indisponível'}</AlertTitle>
            <AlertDescription>
              {result.ok === false && result.reason === 'error'
                ? 'Tente de novo em instantes.'
                : 'Este link expirou, já foi respondido ou foi cancelado. Peça um novo ao seu nutricionista.'}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {data.patient_first_name ? `Olá, ${data.patient_first_name}!` : 'Olá!'}
            </h1>
            <p className="mt-2 text-muted-foreground">
              Responda o questionário <strong className="text-foreground">{data.title}</strong> antes da sua consulta. Leva poucos minutos. Você pode salvar e terminar
              depois, até {expires}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Perguntas com * são obrigatórias. Suas respostas só ficam visíveis para o seu nutricionista.</p>
            <div className="mt-8">
              <PublicAnamnesisForm token={token} data={data} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
