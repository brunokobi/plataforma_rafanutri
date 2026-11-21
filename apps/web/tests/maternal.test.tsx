import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedingGuide } from '@/components/maternal/feeding-guide';
import { LineChart } from '@/components/maternal/line-chart';
import { showsMaternal } from '@/components/patients/patient-record';
import { ageLabel, childView, pregnancyView, weeksLabel } from '@/lib/maternal/view';
import type { MaternalMeasurement, Pregnancy } from '@/lib/maternal/types';

const addMaternalMeasurement = vi.fn(async () => ({ ok: true as const, data: { id: 'm1' } }));
vi.mock('@/lib/maternal/actions', () => ({ addMaternalMeasurement: (...a: unknown[]) => addMaternalMeasurement(...(a as [])), openPregnancy: vi.fn(), updatePregnancy: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

afterEach(cleanup);

const m = (id: string, date: string, w: number | null, h: number | null = null): MaternalMeasurement => ({ id, assessed_at: date, weight_kg: w, height_cm: h, head_circumference_cm: null, measured_lying: null, notes: null });

describe('materno-infantil', () => {
  it('idade por extenso', () => {
    expect(ageLabel(10)).toBe('10 dias');
    expect(ageLabel(400)).toBe('1 ano e 1 mês');
    expect(ageLabel(4000)).toMatch(/^10 anos/);
    expect(weeksLabel(20.43)).toBe('20 semanas e 3 dias');
  });

  it('curvas da criança: tabela, gráfico e alerta de queda', () => {
    const v = childView('female', '2025-01-01', [m('a', '2025-07-01', 7.5, 66), m('b', '2026-01-01', 7.6, 72)], 'wfa');
    expect(v.rows).toHaveLength(2);
    expect(v.rows[0]!.date).toBe('2026-01-01');
    expect(v.chart?.xUnit).toBe('meses');
    expect(v.chart?.curves.map((c) => c.z)).toEqual([-3, -2, 0, 2, 3]);
    expect(v.alerts.some((a) => /queda/.test(a.message))).toBe(true);
  });

  it('gestação: faixa, situação da última pesagem e pesagens fora do período ignoradas', () => {
    const p: Pregnancy = { id: 'g', lmp_date: '2026-05-01', pre_pregnancy_weight_kg: 60, height_cm: 165, status: 'active', ended_on: null, outcome: null, notes: null };
    const v = pregnancyView(p, [m('x', '2026-04-01', 59), m('y', '2026-08-07', 64), m('z', '2026-11-06', 75)], '2026-11-10');
    expect(v.clsLabel).toBe('Eutrofia');
    expect(v.rows.map((r) => r.id)).toEqual(['z', 'y']);
    expect(v.latest?.status).toBe('above');
    expect(v.due).toBe('2027-02-05');
  });

  it('aba aparece para crianças e para quem pode gestar', () => {
    expect(showsMaternal({ sex: 'female', birth_date: '1990-01-01' })).toBe(true);
    expect(showsMaternal({ sex: 'male', birth_date: '2020-01-01' })).toBe(true);
    expect(showsMaternal({ sex: 'male', birth_date: '1980-01-01' })).toBe(false);
  });

  it('guia de introdução alimentar pela idade', () => {
    render(<FeedingGuide ageMonths={6.5} />);
    expect(screen.getByText(/Alimentação nesta fase · 6 meses/)).toBeTruthy();
    expect(screen.getByText(/Mel é contraindicado/)).toBeTruthy();
  });

  it('gráfico com faixa e pontos', () => {
    const { container } = render(<LineChart title="Teste" xLabel="x" yLabel="y" xMax={40} band={[{ x: 0, min: 0, max: 0 }, { x: 40, min: 8, max: 12 }]} points={[[20, 3]]} pointLabel={() => 'p'} />);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Teste' })).toBeTruthy();
  });

  it('nova medida envia os números com vírgula convertidos', async () => {
    const { MeasurementForm } = await import('@/components/maternal/maternal-forms');
    render(<MeasurementForm patientId="00000000-0000-0000-0000-000000000001" child under2 />);
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '9,4' } });
    fireEvent.change(screen.getByLabelText('Comprimento (cm)'), { target: { value: '76,5' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar medida' })));
    expect(addMaternalMeasurement).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001', expect.objectContaining({ weight_kg: 9.4, height_cm: 76.5, measured_lying: true }));
  });
});
