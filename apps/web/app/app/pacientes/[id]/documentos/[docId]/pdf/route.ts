import { getDocument } from '@/lib/documents/actions';
import { clinicalDocumentPdfResponse } from '@/lib/documents/pdf-response';

export const dynamic = 'force-dynamic';

/** RN-215 — PDF do documento para o profissional (rascunho sai com a marca d'água "RASCUNHO"). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { docId } = await params;
  const payload = await getDocument(docId);
  if (!payload) return new Response('Documento não encontrado.', { status: 404 });
  return clinicalDocumentPdfResponse(payload);
}
