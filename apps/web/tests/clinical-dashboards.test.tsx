import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MetricChart } from '@/components/charts/metric-chart';
import { PatientsDashboard } from '@/components/clinical/patients-dashboard';
import { PatientDashboard } from '@/components/patients/patient-dashboard';
import type { PatientDashboard as PD, PatientsDashboard as GD } from '@/lib/clinical-dashboard/types';

afterEach(cleanup);

const general: GD = {
  counts: { active: 10, inactive: 1, archived: 2, new_30d: 3, with_app: 4, with_plan: 5 },
  weight: { tracked: 4, mean_change_kg: -1.8, losing: 3, stable: 1, gaining: 0 },
  bmi: { under: 0, normal: 3, over: 4, obese: 1 },
  ages: { child: 1, teen: 1, adult: 7, elderly: 1, unknown: 0 },
  sex: { female: 7, male: 3, unknown: 0 },
  risk: { low: 0, medium: 0, high: 0, none: 10 },
  visits: { completed_30d: 12, next_7d: 5, no_show_rate_90d: 8.3 },
  attention: [
    { patient_id: '1', full_name: 'Ana', reasons: ['no_return', 'no_plan'], last_visit_at: '2026-09-01T12:00:00Z', next_visit_at: null },
    { patient_id: '2', full_name: 'Bia', reasons: ['plan_expiring'], last_visit_at: null, next_visit_at: '2026-11-30T12:00:00Z' },
  ],
  by_reason: { no_return: 1, never_seen: 0, plan_expired: 0, plan_expiring: 1, no_plan: 1, no_assessment: 0, risk_high: 0, pending_anamnesis: 0 },
};

describe('painel geral dos pacientes', () => {
  it('números, filtros por motivo com contagem e lista de atenção', () => {
    render(<PatientsDashboard data={general} reason={null} />);
    expect(screen.getByText('50%')).toBeTruthy(); // com plano publicado
    expect(screen.getByText('8,3%')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Filtrar por motivo' });
    expect(within(nav).getByRole('link', { name: /Retorno atrasado 1/ }).getAttribute('href')).toBe('/app/pacientes?atencao=no_return');
    expect(within(nav).queryByRole('link', { name: /Sem consulta/ })).toBeNull();
    const list = screen.getByRole('list', { name: 'Pacientes que precisam de atenção' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByRole('link', { name: 'Ana' }).getAttribute('href')).toBe('/app/pacientes/1');
    expect(screen.getByText(/Nenhum paciente triado ainda/)).toBeTruthy();
  });

  it('filtrado por motivo mostra só quem tem o motivo', () => {
    render(<PatientsDashboard data={general} reason="plan_expiring" />);
    const list = screen.getByRole('list', { name: 'Pacientes que precisam de atenção' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Bia')).toBeTruthy();
  });
});

const patient: PD = {
  series: [
    { date: '2026-08-01', weight_kg: 82, bmi: 29.1, body_fat_pct: null, waist_cm: 98 },
    { date: '2026-10-01', weight_kg: 79.5, bmi: 28.2, body_fat_pct: null, waist_cm: null },
  ],
  weight: { first: { date: '2026-08-01', weight_kg: 82, bmi: 29.1, body_fat_pct: null, waist_cm: 98 }, last: { date: '2026-10-01', weight_kg: 79.5, bmi: 28.2, body_fat_pct: null, waist_cm: null }, change_kg: -2.5 },
  visits: { completed: 3, no_show: 1, first_at: '2026-08-01T12:00:00Z', last_at: '2026-10-01T12:00:00Z', next_at: null, days_since_last: 52 },
  plan: { published: { id: 'pl', title: 'Plano', published_at: '2026-10-01T12:00:00Z', valid_until: '2026-12-01', days_left: 9, kcal: 1800 }, versions: 2, drafts: 0 },
  notes: { count: 2, last_at: '2026-10-01T12:00:00Z' },
  anamneses: { answered_pending: 1, sent: 0, total: 2 },
  recommendations: { published: 3, unread: 1 },
  package: { name: 'Trimestral', remaining: 2, total: 6, expires_at: null },
  app: { linked: true, activated_at: null },
  screening: null,
  documents: 0,
  timeline: [{ kind: 'plan', at: '2026-10-01T12:00:00Z', label: 'Plano publicado: Plano' }, { kind: 'visit', at: '2026-08-01T12:00:00Z', label: 'Primeira consulta' }],
};

describe('painel do paciente', () => {
  it('números do acompanhamento, alertas e histórico', () => {
    render(<PatientDashboard patientId="p" data={patient} />);
    expect(screen.getByText(/Última há 52 dias · sem retorno/)).toBeTruthy();
    expect(screen.getByText('79,5 kg')).toBeTruthy();
    expect(screen.getAllByText(/−2,5 kg desde/).length).toBeGreaterThan(0);
    expect(screen.getByText('1.800 kcal')).toBeTruthy();
    expect(screen.getByText('Vence em 9 dias')).toBeTruthy();
    expect(screen.getByText('1 para revisar')).toBeTruthy();
    expect(screen.getByText(/Trimestral: 2 de 6 sessões/)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Histórico do paciente' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('gráfico: só as medidas com dados; troca a medida e mostra o resumo', () => {
    render(<MetricChart series={patient.series} />);
    const group = screen.getByRole('radiogroup', { name: 'Medida do gráfico' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Peso', 'IMC', 'Cintura']);
    expect(screen.getByText(/79,5 kg na última avaliação · −2,5 kg/)).toBeTruthy();
    fireEvent.click(within(group).getByRole('radio', { name: 'IMC' }));
    expect(screen.getByText(/28,2 kg\/m² na última avaliação/)).toBeTruthy();
    fireEvent.click(within(group).getByRole('radio', { name: 'Cintura' }));
    expect(screen.getByText(/98 cm em/)).toBeTruthy();
  });
});
