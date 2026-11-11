import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeAssessment, type AssessmentInput } from '@/lib/assessments/compute';
import { assessmentInputSchema, type Assessment } from '@/lib/assessments/schema';
import type { Patient } from '@/lib/patients/schema';

const createAssessment = vi.fn();
const refresh = vi.fn();
vi.mock('@/lib/assessments/actions', () => ({ createAssessment: (...a: unknown[]) => createAssessment(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { PatientAssessments } = await import('@/components/patients/patient-assessments');

afterEach(() => {
  cleanup();
  createAssessment.mockReset();
  refresh.mockReset();
});

const base: AssessmentInput = {
  assessed_at: '2026-11-11', weight_kg: 80, height_cm: 180, waist_cm: 90, hip_cm: 100,
  protocol: 'jp3', density_equation: 'siri', skinfolds: { chest: 15, abdominal: 20, thigh: 15 }, notes: null,
};

describe('computeAssessment', () => {
  it('calcula IMC, classificação, razões e composição corporal', () => {
    const { results, warnings } = computeAssessment(base, { sex: 'male', ageYears: 30 });
    expect(warnings).toEqual([]);
    expect(results.bmi).toBeCloseTo(24.69, 2);
    expect(results.bmi_class).toBe('normal');
    expect(results.whr).toBeCloseTo(0.9, 3);
    expect(results.whtr).toBeCloseTo(0.5, 3);
    expect(results.waist_risk).toBe('low');
    expect(results.body_fat_pct).toBeCloseTo(15.08, 1); // J&P 3 dobras, S=50, 30 anos
    expect(results.skinfold_sum).toBe(50);
  });
  it('sem sexo e idade avisa e não calcula a composição', () => {
    const { results, warnings } = computeAssessment(base, { sex: null, ageYears: null });
    expect(results.body_fat_pct).toBeUndefined();
    expect(results.bmi).toBeDefined();
    expect(results.bmi_class).toBeUndefined();
    expect(warnings[0]).toMatch(/sexo e data de nascimento/);
  });
  it('ISAK guarda os somatórios', () => {
    const folds = { triceps: 10, subscapular: 12, supraspinale: 8, abdominal: 15, thigh: 14, calf: 7, biceps: 5, iliac_crest: 13 };
    const { results } = computeAssessment({ ...base, protocol: 'isak', skinfolds: folds }, { sex: 'female', ageYears: 30 });
    expect([results.sum6, results.sum8]).toEqual([66, 84]);
  });
});

describe('assessmentInputSchema', () => {
  it('aceita uma avaliação válida', () => expect(assessmentInputSchema.safeParse(base).success).toBe(true));
  it('recusa data futura e avaliação sem nenhuma medida', () => {
    expect(assessmentInputSchema.safeParse({ ...base, assessed_at: '2999-01-01' }).success).toBe(false);
    const empty = assessmentInputSchema.safeParse({ ...base, weight_kg: null, waist_cm: null, skinfolds: {} });
    expect(empty.error?.issues[0]?.message).toBe('Informe ao menos uma medida.');
  });
});

const patient: Patient = {
  id: '3f6c1e2a-9b7d-4c1e-8a2b-1c2d3e4f5a6b', full_name: 'Beatriz Nogueira', birth_date: '1981-03-15', sex: 'female',
  email: null, phone: null, objective: null, status: 'active', created_at: '2026-11-10T21:00:00Z',
};
const saved: Assessment = {
  id: 'a1', patient_id: patient.id, assessed_at: '2026-10-20', weight_kg: 70.4, height_cm: 165, waist_cm: 82, hip_cm: 104,
  protocol: 'jp3', density_equation: 'siri', skinfolds: {}, results: { bmi: 25.86, bmi_class: 'overweight', body_fat_pct: 27.1 },
  notes: 'Primeira avaliação', date_created: '2026-10-20T13:00:00Z',
};

describe('PatientAssessments', () => {
  it('enquanto a coleção não está liberada, avisa e não deixa salvar', () => {
    render(<PatientAssessments patient={patient} assessments="unavailable" />);
    expect(screen.getByText('Gravação de avaliações em ativação')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Salvar avaliação/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mostra o histórico e salva a nova avaliação do paciente', async () => {
    createAssessment.mockResolvedValue({ ok: true });
    render(<PatientAssessments patient={patient} assessments={[saved]} />);
    expect(screen.getByText('Primeira avaliação')).toBeTruthy();
    expect((screen.getByLabelText('Altura (cm)') as HTMLInputElement).value).toBe('165');
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '68,9' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar avaliação/ })));
    expect(createAssessment).toHaveBeenCalledWith(patient.id, expect.objectContaining({ weight_kg: 68.9, height_cm: 165 }));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByText('Avaliação salva.')).toBeTruthy();
  });

  it('mostra o erro do servidor ao salvar', async () => {
    createAssessment.mockResolvedValue({ ok: false, message: 'Você não tem permissão para registrar avaliações neste consultório.' });
    render(<PatientAssessments patient={patient} assessments={[]} />);
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '70' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar avaliação/ })));
    expect(await screen.findByText(/não tem permissão/)).toBeTruthy();
  });
});
