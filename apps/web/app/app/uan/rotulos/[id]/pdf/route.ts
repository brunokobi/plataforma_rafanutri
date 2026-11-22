import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { LabelPdf } from '@/components/pdf/uan-label';
import { getLabel } from '@/lib/uan/label-actions';
import { slugify as slug } from '@/lib/format/text';

export const dynamic = 'force-dynamic';


export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const label = await getLabel(id);
  if (!label) return new Response('Rótulo não encontrado.', { status: 404 });
  const buffer = await renderToBuffer(createElement(LabelPdf, { label }) as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rotulo-${slug(label.product_name)}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
