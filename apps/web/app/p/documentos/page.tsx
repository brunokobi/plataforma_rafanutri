import { ArrowLeft, FileDown, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { patientContextId } from '@/lib/patient-area/context';
import { dateBR } from '@/lib/format/date';
import { getMyDocuments } from '@/lib/documents/actions';
import { KIND_LABEL } from '@/lib/documents/types';
import { getMyPlanDocuments, getPatientArea } from '@/lib/patient-area/actions';

export const metadata: Metadata = { title: 'Documentos', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** RN-209 — PDFs dos planos publicados (o vigente e os anteriores); RN-215 — documentos clínicos publicados. */
export default async function PatientDocumentsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/documentos');
  const c = await patientContextId((await searchParams).c);
  const [area, data, docs] = await Promise.all([getPatientArea(), getMyPlanDocuments(c), getMyDocuments(c)]);
  if (area && !area.patient_account) redirect('/app');
  const record = area?.records.find((r) => r.patient_id === (data?.patient_id ?? c)) ?? area?.records[0] ?? null;
  const q = record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : '';

  return (
    <PatientShell practice={record?.practice ?? null} professional={record?.professional} canSwitch={(area?.records.length ?? 0) > 1}>
      <Link href={`/p${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Início
      </Link>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Documentos</h1>
      {data === null || docs === null ? (
        <Alert variant="destructive"><AlertDescription>Não foi possível carregar os documentos agora. Atualize a página em instantes.</AlertDescription></Alert>
      ) : data.plans.length === 0 && docs.documents.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border p-6 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">Nenhum documento por enquanto</h2>
          <p className="mt-1 text-sm text-muted-foreground">Os PDFs dos seus planos alimentares, pedidos de exames e outros documentos aparecem aqui quando forem publicados.</p>
        </section>
      ) : (
        <>
          {docs.documents.length > 0 && (
            <section aria-labelledby="docs-clinicos" className="space-y-3">
              <h2 id="docs-clinicos" className="font-semibold">Pedidos, prescrições e declarações</h2>
              <ul className="space-y-3" aria-label="Documentos do nutricionista">
                {docs.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{KIND_LABEL[d.kind] ?? 'Documento'}</p>
                      <p className="break-words font-medium">{d.title}</p>
                      <p className="text-sm text-muted-foreground">{dateBR(d.document_date)}</p>
                    </div>
                    <a href={`/p/documentos/doc/${d.id}/pdf`} download className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
                      aria-label={`Baixar PDF: ${d.title}`}>
                      <FileDown className="size-4" aria-hidden="true" /> PDF
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data.plans.length > 0 && (
            <section aria-labelledby="docs-planos" className="space-y-3">
              <h2 id="docs-planos" className="font-semibold">Planos alimentares</h2>
              <ul className="space-y-3" aria-label="Planos alimentares">
                {data.plans.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{p.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.status === 'published' ? 'Plano atual' : 'Plano anterior'} · publicado em {dateBR(p.published_at)}
                        {p.valid_until ? ` · válido até ${dateBR(p.valid_until)}` : ''}
                      </p>
                    </div>
                    <a href={`/p/documentos/${p.id}/pdf${q}`} download className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
                      aria-label={`Baixar PDF: ${p.title} (${p.status === 'published' ? 'atual' : `de ${dateBR(p.published_at)}`})`}>
                      <FileDown className="size-4" aria-hidden="true" /> PDF
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </PatientShell>
  );
}
