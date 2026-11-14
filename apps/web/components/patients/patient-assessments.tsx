'use client';

import { AlertCircle, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AssessmentForm, BMI_LABELS, type HistoryPoint } from '@/components/clinical/assessment-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { createAssessment } from '@/lib/assessments/actions';
import { PROTOCOLS } from '@/lib/assessments/compute';
import type { Assessment, AssessmentInputData } from '@/lib/assessments/schema';
import { ageInYears, type Patient } from '@/lib/patients/schema';
import { dateBR as formatDateBR } from '@/lib/format/date';

const shortDate = (iso: string) => formatDateBR(iso, { day: '2-digit', month: 'short' });
const longDate = (iso: string) => formatDateBR(iso);
const n = (v: number | null | undefined, d = 1, suffix = '') => (v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: d })}${suffix}`);

export function PatientAssessments({ patient, assessments }: { patient: Patient; assessments: Assessment[] | null | 'unavailable' }) {
  const router = useRouter();
  const list = Array.isArray(assessments) ? assessments : [];
  const last = list[0] ?? null;
  const ageYears = patient.birth_date ? ageInYears(patient.birth_date) : null;
  const history: HistoryPoint[] = [...list].reverse().map((a) => ({
    label: shortDate(a.assessed_at),
    weightKg: a.weight_kg,
    bodyFatPct: a.results.body_fat_pct ?? null,
  }));

  async function save(input: AssessmentInputData) {
    const r = await createAssessment(patient.id, input);
    if (r.ok) router.refresh();
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  }

  return (
    <div className="space-y-8">
      {assessments === 'unavailable' && (
        <Alert>
          <Info />
          <AlertTitle>Gravação de avaliações em ativação</AlertTitle>
          <AlertDescription>
            <p>Os cálculos já funcionam, mas o servidor ainda não está liberado para salvar avaliações. Assim que for liberado, o botão “Salvar avaliação” passa a funcionar.</p>
          </AlertDescription>
        </Alert>
      )}
      {assessments === null && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>Não foi possível carregar as avaliações agora. Atualize a página em instantes.</AlertDescription>
        </Alert>
      )}
      {(!patient.sex || !patient.birth_date) && (
        <Alert>
          <Info />
          <AlertDescription>
            <p>Para calcular a composição corporal e classificar o IMC, informe <strong>sexo</strong> e <strong>data de nascimento</strong> em “Editar dados”.</p>
          </AlertDescription>
        </Alert>
      )}

      <AssessmentForm
        key={list.length}
        sex={patient.sex}
        ageYears={ageYears}
        defaults={{
          height: last?.height_cm != null ? String(last.height_cm) : '',
          protocol: last?.protocol ?? 'jp3',
        }}
        history={history}
        previousWeightKg={last?.weight_kg ?? null}
        onSave={Array.isArray(assessments) ? save : undefined}
        saveDisabledReason={assessments === 'unavailable' ? 'A gravação ainda não foi liberada no servidor.' : 'Indisponível no momento.'}
      />

      <section aria-labelledby="historico">
        <h2 id="historico" className="text-lg font-semibold">Histórico</h2>
        {list.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma avaliação registrada ainda.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  {['Data', 'Peso', 'IMC', 'Gordura', 'Massa magra', 'Cintura', 'Protocolo'].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {list.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium">{longDate(a.assessed_at)}</th>
                    <td className="px-4 py-3">{n(a.weight_kg, 1, ' kg')}</td>
                    <td className="px-4 py-3">
                      {n(a.results.bmi)}
                      {a.results.bmi_class && <span className="block text-xs text-muted-foreground">{BMI_LABELS[a.results.bmi_class]}</span>}
                    </td>
                    <td className="px-4 py-3">{n(a.results.body_fat_pct, 1, '%')}</td>
                    <td className="px-4 py-3">{n(a.results.lean_mass_kg, 1, ' kg')}</td>
                    <td className="px-4 py-3">{n(a.waist_cm, 1, ' cm')}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.protocol ? PROTOCOLS.find((p) => p.value === a.protocol)?.label : '—'}
                      {a.notes && <span className="block max-w-56 truncate text-xs" title={a.notes}>{a.notes}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
