import { ArrowLeft, FileDown, FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCurrentUser } from '@/lib/auth/session';
import { dateBR } from '@/lib/format/date';
import { getMyPlanDocuments, getPatientArea } from '@/lib/patient-area/actions';

export const metadata: Metadata = { title: 'Documentos', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** RN-209 — PDFs dos planos publicados: o vigente e os anteriores. */
export default async function PatientDocumentsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/documentos');
  const { c } = await searchParams;
  const [area, data] = await Promise.all([getPatientArea(), getMyPlanDocuments(c)]);
  if (area && !area.patient_account) redirect('/app');
  const record = area?.records.find((r) => r.patient_id === (data?.patient_id ?? c)) ?? area?.records[0] ?? null;
  const q = record && (area?.records.length ?? 0) > 1 ? `?c=${record.patient_id}` : '';

  return (
    <PatientShell practice={record?.practice ?? null} professional={record?.professional}>
      <Link href={`/p${q}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Início
      </Link>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Documentos</h1>
      {data === null ? (
        <Alert variant="destructive"><AlertDescription>Não foi possível carregar os documentos agora. Atualize a página em instantes.</AlertDescription></Alert>
      ) : data.plans.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border p-6 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">Nenhum documento por enquanto</h2>
          <p className="mt-1 text-sm text-muted-foreground">Os PDFs dos seus planos alimentares aparecem aqui quando forem publicados.</p>
        </section>
      ) : (
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
      )}
    </PatientShell>
  );
}
