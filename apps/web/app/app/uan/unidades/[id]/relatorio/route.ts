import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { MonthlyPdf } from '@/components/pdf/uan-monthly';
import { getMonthly } from '@/lib/uan/network-actions';
import { slugify as slug } from '@/lib/format/text';

export const dynamic = 'force-dynamic';

/** RN-229 — Relatório mensal da unidade em PDF (`?mes=AAAA-MM`). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getMonthly(id, new URL(req.url).searchParams.get('mes') ?? undefined);
  if (data === undefined) return new Response('Unidade não encontrada.', { status: 404 });
  if (data === null) return new Response('Só o responsável, o gestor, o RT ou o auditor veem o relatório.', { status: 403 });
  const buffer = await renderToBuffer(createElement(MonthlyPdf, { data }) as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-${slug(data.unit.name)}-${data.month}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
