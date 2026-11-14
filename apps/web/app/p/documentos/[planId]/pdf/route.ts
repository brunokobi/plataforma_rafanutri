import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { MealPlanDocument } from '@/components/pdf/meal-plan-document';
import { getPatientPlan } from '@/lib/patient-area/actions';
import { patientPdfFileName, patientPlanPdfData } from '@/lib/patient-area/plan-pdf';

export const dynamic = 'force-dynamic';

/**
 * RN-209 — PDF do plano para o paciente, gerado na hora com a sessão dele. Não há arquivo guardado
 * nem link reaproveitável: o Directus confere a cada pedido que o plano é do registro ligado à conta.
 */
export async function GET(req: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return new Response('Plano não encontrado.', { status: 404 });
  const c = new URL(req.url).searchParams.get('c') ?? undefined;
  const payload = await getPatientPlan(c, planId);
  if (!payload || payload.plan.id !== planId) return new Response('Plano não encontrado.', { status: 404 });
  const buffer = await renderToBuffer(createElement(MealPlanDocument, { data: patientPlanPdfData(payload) }) as Parameters<typeof renderToBuffer>[0]);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${patientPdfFileName(payload.plan.published_at)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
