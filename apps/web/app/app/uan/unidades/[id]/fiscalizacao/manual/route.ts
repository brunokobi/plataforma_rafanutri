import { createHash } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { ManualPdf } from '@/components/pdf/uan-legal';
import { getCurrentUser } from '@/lib/auth/session';
import { localToday } from '@/lib/uan/costs';
import { manualIncludes } from '@/lib/uan/legal';
import { getManual, registerExport } from '@/lib/uan/legal-actions';
import { slugify as slug } from '@/lib/format/text';

export const dynamic = 'force-dynamic';


/** RN-157 — Emite o Manual de Boas Práticas em PDF (nova edição registrada com o hash do arquivo).
    `?previa=1` gera sem registrar (marcado como prévia). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response('Faça login.', { status: 401 });
  const data = await getManual(id);
  if (!data) return new Response('Unidade não encontrada.', { status: 404 });
  const preview = new URL(req.url).searchParams.get('previa') === '1';
  if (!preview && !data.can_issue) return new Response('Só o RT da unidade ou o responsável pela empresa emitem o Manual.', { status: 403 });
  const today = localToday();
  const edition = (data.editions[0]?.edition ?? 0) + 1;
  const signer = preview ? 'PRÉVIA — sem validade' : [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
  const buffer = await renderToBuffer(createElement(ManualPdf, { data, edition, today, signer }) as Parameters<typeof renderToBuffer>[0]);
  if (!preview) {
    const r = await registerExport(id, { kind: 'manual', file_hash: createHash('sha256').update(buffer).digest('hex'), includes: manualIncludes(data) });
    if (!r.ok) return new Response(r.message, { status: 409 });
  }
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="manual-boas-praticas-${slug(data.unit.name)}-${preview ? 'previa' : `edicao-${edition}`}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
