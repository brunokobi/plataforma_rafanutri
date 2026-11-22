import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { HaccpPdf } from '@/components/pdf/uan-haccp';
import { getHaccpPlan } from '@/lib/uan/haccp-actions';
import { slugify as slug } from '@/lib/format/text';

export const dynamic = 'force-dynamic';


/** RN-161 — PDF do plano APPCC (fluxograma, análise de perigos e quadro de PCC). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getHaccpPlan(id);
  if (!data) return new Response('Plano não encontrado.', { status: 404 });
  const buffer = await renderToBuffer(createElement(HaccpPdf, { data }) as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="appcc-${slug(data.plan.title)}-v${data.plan.version}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
