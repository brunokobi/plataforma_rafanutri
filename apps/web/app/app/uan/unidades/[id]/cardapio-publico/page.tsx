import { AlertCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { AppHeader } from '@/components/app/app-header';
import { PublicMenuSettingsView } from '@/components/uan/public-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { getPublicMenuSettings } from '@/lib/uan/public-menu-actions';

export const metadata: Metadata = { title: 'Cardápio público e satisfação', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/unidades/${id}/cardapio-publico`);
  const d = await getPublicMenuSettings(id);
  if (d === undefined) notFound();
  const origin = env.NEXT_PUBLIC_SITE_URL;
  const qr = d?.token ? await QRCode.toString(`${origin}/cardapio/${d.token}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }) : null;
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-5 sm:py-10">
        {d === null ? (
          <Alert variant="destructive"><AlertCircle /><AlertDescription>Não foi possível carregar agora (só o responsável, o gestor e o RT configuram).</AlertDescription></Alert>
        ) : (
          <>
            <div>
              <Link href={`/app/uan/unidades/${id}`} className="text-sm text-muted-foreground hover:underline">← {d.unit.name}</Link>
              <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Cardápio público e satisfação</h1>
            </div>
            <PublicMenuSettingsView data={d} origin={origin} qrSvg={qr} />
          </>
        )}
      </main>
    </div>
  );
}
