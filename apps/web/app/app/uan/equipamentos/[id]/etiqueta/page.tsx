import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { PrintButton } from '@/components/uan/print-button';
import { getCurrentUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { getEquipment } from '@/lib/uan/temperature-actions';
import { EQUIPMENT_KIND_LABEL, limitsLabel } from '@/lib/uan/temperatures';

export const metadata: Metadata = { title: 'Etiqueta do equipamento', robots: { index: false } };

/** Etiqueta para imprimir e colar no equipamento: o QR abre o registro de temperatura (com login). */
export default async function EquipmentLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/app/uan/equipamentos/${id}/etiqueta`);
  const detail = await getEquipment(id, 1);
  if (!detail) notFound();
  const url = `${env.NEXT_PUBLIC_SITE_URL}/app/uan/equipamentos/${detail.equipment.id}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });

  return (
    <main className="mx-auto max-w-md space-y-6 px-5 py-8 print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/app/uan/equipamentos/${detail.equipment.id}`} className="text-sm text-muted-foreground hover:underline">← {detail.equipment.name}</Link>
        <PrintButton />
      </div>
      <article aria-label="Etiqueta" className="mx-auto w-72 space-y-3 rounded-xl border-2 border-black bg-white p-4 text-center text-black">
        <p className="text-xs font-semibold uppercase tracking-wide">{detail.unit.name}</p>
        <h1 className="text-xl font-bold leading-tight">{detail.equipment.name}</h1>
        <p className="text-sm">{EQUIPMENT_KIND_LABEL[detail.equipment.kind]} · limite {limitsLabel(detail.equipment)}</p>
        {/* SVG gerado pela biblioteca qrcode a partir da URL do próprio app */}
        <div role="img" aria-label="QR code para registrar a temperatura" className="mx-auto w-48 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="text-xs">Aponte a câmera para registrar a temperatura a cada {detail.equipment.reading_interval_hours} h</p>
      </article>
    </main>
  );
}
