import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { UnsubscribeButton } from '@/components/notifications/unsubscribe-button';

export const metadata: Metadata = { title: 'Cancelar avisos por e-mail', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Link do rodapé dos e-mails de aviso: desliga o e-mail do paciente naquele consultório (com um clique de confirmação). */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-5 py-10">
      <Logo href="/" />
      <h1 className="font-display text-2xl font-semibold tracking-tight">Avisos por e-mail</h1>
      {t ? (
        <>
          <p className="text-sm text-muted-foreground">Ao confirmar, você deixa de receber por e-mail os avisos do seu consultório (consultas e lembretes). Os avisos pelo Telegram, se estiverem ligados, continuam.</p>
          <UnsubscribeButton token={t} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Link inválido. Você pode desligar os e-mails na sua área do paciente, em Avisos.</p>
      )}
      <Link href="/p/avisos" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Abrir meus avisos</Link>
    </main>
  );
}
