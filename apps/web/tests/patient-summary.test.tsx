import type { Questionnaire } from '@rafanutri/forms';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientRecord, variationText } from '@/components/patients/patient-record';
import { extractHealthAlerts } from '@/lib/anamneses/alerts';
import type { Anamnesis } from '@/lib/anamneses/repository';
import { toInstant } from '@/lib/appointments/schema';
import type { Assessment } from '@/lib/assessments/schema';
import type { Patient } from '@/lib/patients/schema';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/patients/actions', () => ({ setPatientStatus: vi.fn(), updatePatient: vi.fn(), createPatient: vi.fn() }));
afterEach(cleanup);

const schema: Questionnaire = {
  version: 1,
  sections: [{ title: 'Saúde', questions: [
    { id: 'alergias', type: 'text', label: 'Alergias ou intolerâncias alimentares' },
    { id: 'restricao_usa', type: 'yesno', label: 'Segue alguma restrição alimentar?' },
    { id: 'restricao', type: 'multiple', label: 'Quais restrições?', options: [{ value: 'vegano', label: 'Vegana' }, { value: 'sem_gluten', label: 'Sem glúten' }], show_if: { question: 'restricao_usa', equals: true } },
    { id: 'sono', type: 'number', label: 'Horas de sono' },
  ] }],
};
const anamnesis = (over: Partial<Anamnesis>): Anamnesis => ({
  id: 'a', patient_id: 'p', title: 'Anamnese clínica', schema_snapshot: schema, answers: {}, status: 'answered',
  token_expires_at: null, answered_at: '2026-11-10T12:00:00Z', reviewed_at: null, date_created: '2026-11-09T12:00:00Z', ...over,
});

describe('alergias e restrições da anamnese', () => {
  it('pega as respostas de alergia/intolerância/restrição da anamnese respondida mais recente', () => {
    const r = extractHealthAlerts([
      anamnesis({ id: 'velha', answered_at: '2026-01-01T00:00:00Z', answers: { alergias: 'Camarão' } }),
      anamnesis({ id: 'nova', status: 'reviewed', answers: { alergias: 'Lactose', restricao_usa: true, restricao: ['sem_gluten'], sono: 7 } }),
      anamnesis({ id: 'pendente', status: 'sent', answered_at: null, answers: { alergias: 'Ovo' } }),
    ])!;
    expect(r.items.map((i) => i.text)).toEqual(['Lactose', 'Sim', 'Sem glúten']);
    expect(r.source.reviewed).toBe(true);
  });
  it('ignora "não"/"nenhuma", respostas "não" em sim/não e perguntas ocultas', () => {
    expect(extractHealthAlerts([anamnesis({ answers: { alergias: 'Nenhuma', restricao_usa: false, restricao: ['vegano'] } })])).toBeNull();
    expect(extractHealthAlerts([])).toBeNull();
    expect(extractHealthAlerts(null)).toBeNull();
  });
});

const assessment = (date: string, weight: number | null, fat?: number): Assessment =>
  ({ id: date, assessed_at: date, weight_kg: weight, results: fat === undefined ? {} : { body_fat_pct: fat } }) as unknown as Assessment;

describe('variação entre avaliações', () => {
  it('peso e gordura com sinal', () => {
    expect(variationText(assessment('2026-11-10', 68.1, 27.2), assessment('2026-10-20', 69.6, 28))).toBe('Peso −1,5 kg e gordura −0,8 ponto desde 20 de out. de 2026.');
    expect(variationText(assessment('2026-11-10', 70, 30), assessment('2026-10-20', 68, 27))).toBe('Peso +2 kg e gordura +3 pontos desde 20 de out. de 2026.');
    expect(variationText(assessment('2026-11-10', null), assessment('2026-10-20', 69))).toMatch(/Sem medidas comparáveis/);
  });
});

const patient: Patient = {
  id: '11111111-1111-4111-8111-111111111111', full_name: 'Marina Costa', birth_date: '1994-03-12', sex: 'female', email: null,
  phone: null, objective: 'Emagrecimento', status: 'active', created_at: '2026-11-01T00:00:00Z',
};

describe('ficha resumo', () => {
  it('mostra alergias em destaque, variação e próxima consulta', () => {
    render(
      <PatientRecord
        patient={patient}
        activeLimitReached={false}
        latestAssessment={assessment('2026-11-10', 68.1, 27.2)}
        previousAssessment={assessment('2026-10-20', 69.6, 28)}
        nextAppointment={{ id: 'x', patient_id: null, starts_at: toInstant('2026-11-20', '09:30'), ends_at: toInstant('2026-11-20', '10:15'), type: 'return', mode: 'online', status: 'scheduled', meeting_url: null, notes: null }}
        alerts={extractHealthAlerts([anamnesis({ answers: { alergias: 'Lactose' } })])}
      />,
    );
    const note = screen.getByRole('note', { name: 'Alergias e restrições' });
    expect(within(note).getByText('Lactose')).toBeTruthy();
    expect(within(note).getByText(/ainda não revisada/)).toBeTruthy();
    expect(screen.getByTestId('assessment-variation').textContent).toMatch(/Peso −1,5 kg/);
    expect(screen.getByTestId('next-appointment').textContent).toMatch(/às 09:30/);
  });
  it('sem consulta marcada oferece marcar; sem alergias não mostra o destaque', () => {
    render(<PatientRecord patient={patient} activeLimitReached={false} />);
    expect(screen.getByRole('link', { name: 'Agendar a próxima' }).getAttribute('href')).toBe(`/app/agenda?paciente=${patient.id}`);
    expect(screen.queryByRole('note', { name: 'Alergias e restrições' })).toBeNull();
  });
});
