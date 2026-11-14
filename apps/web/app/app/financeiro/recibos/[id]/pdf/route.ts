import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { ReceiptDocument } from '@/components/pdf/receipt-document';
import { practiceLogo } from '@/lib/documents/pdf-response';
import { getReceipt } from '@/lib/finance/actions';
import { receiptFileName, receiptPdfData } from '@/lib/finance/receipt-pdf-data';

export const dynamic = 'force-dynamic';

/** RN-055 — PDF do recibo, gerado na hora com a sessão de quem pede (o Directus confere o consultório). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = await getReceipt(id);
  if (!payload) return new Response('Recibo não encontrado.', { status: 404 });
  const logo = await practiceLogo(payload.header.organization_id);
  const buffer = await renderToBuffer(createElement(ReceiptDocument, { data: receiptPdfData(payload), logo }) as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${receiptFileName(payload.receipt.number)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
