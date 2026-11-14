import { getMyDocument } from '@/lib/documents/actions';
import { clinicalDocumentPdfResponse } from '@/lib/documents/pdf-response';

export const dynamic = 'force-dynamic';

/** RN-215 — PDF do documento para o paciente: o Directus só devolve publicados do registro ligado à conta. */
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const payload = await getMyDocument(docId);
  if (!payload || payload.document.status !== 'published') return new Response('Documento não encontrado.', { status: 404 });
  return clinicalDocumentPdfResponse(payload);
}
