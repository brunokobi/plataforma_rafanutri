import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { TrainingCertificatePdf } from '@/components/pdf/uan-certificate';
import { getUanContext } from '@/lib/uan/actions';
import { getTrainings } from '@/lib/uan/document-actions';

export const dynamic = 'force-dynamic';
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

/** RN-159 — Certificados do treinamento em PDF (uma página por participante). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; trainingId: string }> }) {
  const { id, trainingId } = await params;
  const data = await getTrainings(id);
  const t = data?.trainings.find((x) => x.id === trainingId);
  if (!data || !t) return new Response('Treinamento não encontrado.', { status: 404 });
  if (!t.attendees.length) return new Response('Treinamento sem participantes.', { status: 409 });
  const orgs = await getUanContext();
  const organization = orgs?.find((o) => o.units.some((u) => u.id === id))?.name ?? null;
  const buffer = await renderToBuffer(createElement(TrainingCertificatePdf, { unit: data.unit.name, organization, training: t }) as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificados-${slug(t.topic)}-${t.held_on}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
