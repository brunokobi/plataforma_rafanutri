import { renderToBuffer } from '@react-pdf/renderer';
import { cookies } from 'next/headers';
import { createElement } from 'react';
import { ClinicalDocumentPdf, type PdfLogo } from '@/components/pdf/clinical-document';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';
import { clinicalDocumentPdfData } from './pdf-data';
import { documentFileName, type DocumentPayload } from './types';

/** Logo do consultório (PNG ou JPEG; o PDF não desenha SVG nem WebP). Sem logo, o PDF sai só com o nome. */
export async function practiceLogo(organizationId: string): Promise<PdfLogo | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token || !/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri/practices/${organizationId}/logo`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) return null;
    const format = type.startsWith('image/png') ? 'png' : type.startsWith('image/jpeg') ? 'jpg' : null;
    if (!format) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return data.length > 0 && data.length <= 2_000_000 ? { data, format } : null;
  } catch {
    return null;
  }
}

/** PDF do documento gerado na hora, sem arquivo guardado. */
export async function clinicalDocumentPdfResponse(payload: DocumentPayload): Promise<Response> {
  const logo = await practiceLogo(payload.header.organization_id);
  const element = createElement(ClinicalDocumentPdf, { data: clinicalDocumentPdfData(payload), logo });
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${documentFileName(payload.document)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
