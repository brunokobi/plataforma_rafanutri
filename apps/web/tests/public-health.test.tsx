import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navModel } from '@/components/app/app-nav';
import { ScreeningForm } from '@/components/public-health/screening-form';
import { resolveModuleAccess } from '@/lib/modules/access';
import { MODULES } from '@/lib/modules/catalog';

const saveScreening = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/lib/public-health/actions', () => ({ saveScreening: (...a: unknown[]) => saveScreening(...(a as [])) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const prefill = { weight_kg: 52, weighed_on: '2026-11-01', height_cm: 165, bmi: 19.1, loss_3_6m: 7, loss_3m: 4, loss_6m: 8 };

describe('saúde pública — triagens', () => {
  it('MUST pré-preenchido pelas avaliações: IMC 19,1 e 7% = risco alto; salva as respostas', async () => {
    render(<ScreeningForm patientId="p1" ageYears={72} prefill={prefill} />);
    const result = screen.getByRole('status', { name: 'Resultado' });
    expect(result.textContent).toMatch(/Risco alto/);
    expect(result.textContent).toMatch(/2 pontos/);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar triagem' })));
    expect(saveScreening).toHaveBeenCalledWith('p1', 'must', { bmi: 19.1, weightLossPct: 7, acuteDiseaseNoIntake: false }, null);
  });

  it('NRS-2002: "sim" na inicial abre a final e pede as notas; 72 anos 1+1 = em risco', () => {
    render(<ScreeningForm patientId="p1" ageYears={72} prefill={{ ...prefill, bmi: 22, loss_3m: 0 }} />);
    fireEvent.click(screen.getByRole('radio', { name: /NRS-2002/ }));
    expect(screen.queryByLabelText('Gravidade da doença')).toBeNull();
    expect(screen.getByRole('status', { name: 'Resultado' }).textContent).toMatch(/Sem risco na triagem inicial/);
    fireEvent.click(screen.getByLabelText('Reduziu a ingestão na última semana'));
    expect(screen.getByRole('button', { name: 'Salvar triagem' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Comprometimento do estado nutricional'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Gravidade da doença'), { target: { value: '1' } });
    expect(screen.getByRole('status', { name: 'Resultado' }).textContent).toMatch(/Em risco nutricional · 3 pontos/);
  });

  it('ASG: sugere a classe, mas só salva com a decisão do profissional', () => {
    render(<ScreeningForm patientId="p1" ageYears={50} prefill={prefill} />);
    fireEvent.click(screen.getByRole('radio', { name: /ASG/ }));
    fireEvent.change(screen.getByLabelText('Ingestão alimentar'), { target: { value: 'suboptimal_solid' } });
    expect(screen.getByText(/Sugestão pelas respostas/).textContent).toMatch(/B —/);
    expect(screen.getByRole('button', { name: 'Salvar triagem' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('radio', { name: /^C —/ }));
    expect(screen.getByRole('status', { name: 'Resultado' }).textContent).toMatch(/Risco alto/);
  });

  it('módulo por contrato e link no menu', () => {
    const m = MODULES.find((x) => x.code === 'public_health')!;
    expect(resolveModuleAccess('clinic', m).status).toBe('contract');
    expect(resolveModuleAccess('clinic', m, ['clinical', 'public_health']).status).toBe('available');
    const links = (o: boolean) => navModel('/app', { publicHealth: o }).flatMap((g) => g.links.map((l) => l.href));
    expect(links(true)).toContain('/app/saude-publica');
    expect(links(false)).not.toContain('/app/saude-publica');
  });
});
