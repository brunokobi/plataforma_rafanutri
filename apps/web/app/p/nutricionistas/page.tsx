import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PatientShell } from '@/components/patient-area/patient-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { getPatientArea } from '@/lib/patient-area/actions';
import { patientContextId } from '@/lib/patient-area/context';
import { choosePatientRecord } from '@/lib/patient-area/context-actions';

export const metadata: Metadata = { title: 'Seus nutricionistas', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** RN-211 — Escolha do nutricionista quando a conta tem mais de um vínculo. Lembrada em cookie. */
export default async function ChoosePractitionerPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/p/nutricionistas');
  const area = await getPatientArea();
  if (area && !area.patient_account) redirect('/app');
  const records = area?.records ?? [];
  if (records.length <= 1) redirect('/p');
  const current = await patientContextId();

  return (
    <PatientShell practice={null}>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Com qual nutricionista?</h1>
      <p className="text-muted-foreground">Você é acompanhado por mais de um nutricionista. Os planos, receitas e recomendações de cada um ficam separados.</p>
      <ul className="space-y-3" aria-label="Seus nutricionistas">
        {records.map((r) => (
          <li key={r.patient_id}>
            <form action={choosePatientRecord}>
              <input type="hidden" name="patient_id" value={r.patient_id} />
              <button type="submit" className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-primary/60"
                style={r.practice.brand_color ? { borderLeft: `6px solid ${r.practice.brand_color}` } : undefined}>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold">{r.practice.name}</span>
                  {r.professional.name && <span className="block text-sm text-muted-foreground">{r.professional.name}{r.professional.crn ? ` · ${r.professional.crn}` : ''}</span>}
                </span>
                {current === r.patient_id && <span className="inline-flex shrink-0 items-center gap-1 text-sm text-primary"><Check className="size-4" aria-hidden="true" /> Atual</span>}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </PatientShell>
  );
}
