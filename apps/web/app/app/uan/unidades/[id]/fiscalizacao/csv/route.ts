import { csvRows, toCsv, type CsvKind } from '@/lib/uan/csv';
import { getDossier } from '@/lib/uan/legal-actions';

export const dynamic = 'force-dynamic';
const KINDS = new Set<CsvKind>(['temperaturas', 'checklists', 'nao-conformidades', 'treinamentos']);

/** RN-166 — CSV de um tipo de registro no período (mesmo acesso do dossiê). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const kind = q.get('tipo') as CsvKind;
  if (!KINDS.has(kind)) return new Response('Tipo inválido.', { status: 400 });
  const data = await getDossier(id, q.get('de') ?? undefined, q.get('ate') ?? undefined);
  if (data === undefined) return new Response('Unidade não encontrada.', { status: 404 });
  if (data === null) return new Response('Sem permissão ou período inválido (até 92 dias).', { status: 403 });
  return new Response(toCsv(csvRows(kind, data)), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kind}-${data.period.from}-a-${data.period.to}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
