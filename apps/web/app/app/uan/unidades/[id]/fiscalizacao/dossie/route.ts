import { createHash } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { DossierPdf } from '@/components/pdf/uan-legal';
import { getCurrentUser } from '@/lib/auth/session';
import { localToday } from '@/lib/uan/costs';
import { getDossier, registerExport } from '@/lib/uan/legal-actions';
import { slugify as slug } from '@/lib/format/text';

export const dynamic = 'force-dynamic';


/** RN-166 — Dossiê do período em PDF, com a verificação de integridade; a emissão fica registrada. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response('Faça login.', { status: 401 });
  const q = new URL(req.url).searchParams;
  const data = await getDossier(id, q.get('de') ?? undefined, q.get('ate') ?? undefined);
  if (data === undefined) return new Response('Unidade não encontrada.', { status: 404 });
  if (data === null) return new Response('Sem permissão ou período inválido (até 92 dias).', { status: 403 });
  const buffer = await renderToBuffer(createElement(DossierPdf, { data, today: localToday() }) as Parameters<typeof renderToBuffer>[0]);
  const r = await registerExport(id, {
    kind: 'dossier', file_hash: createHash('sha256').update(buffer).digest('hex'), period_from: data.period.from, period_to: data.period.to,
    includes: { documents: data.documents.map((d) => ({ id: d.id, version: d.version })), checklists: data.checklists.length, temperatures: data.temperatures.length, non_conformities: data.non_conformities.length, trainings: data.trainings.length },
    integrity: { total: data.integrity.total, divergent: data.integrity.divergent },
  });
  if (!r.ok) return new Response(r.message, { status: 409 });
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dossie-${slug(data.unit.name)}-${data.period.from}-a-${data.period.to}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
