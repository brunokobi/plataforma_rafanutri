import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientsList } from '@/components/clinical/patients-list';
import { WaitlistForm } from '@/components/plan/waitlist-form';
import type { Patient } from '@/lib/patients/schema';
import { getEntitlements, seatsInfo, seatsMessage } from '@/lib/plan/seats';

const joinWaitlist = vi.fn<(p: string | null, n: string) => Promise<{ ok: true } | { ok: false; message: string }>>(async () => ({ ok: true }));
vi.mock('@/lib/plan/actions', () => ({ joinWaitlist: (p: string | null, n: string) => joinWaitlist(p, n) }));
vi.mock('@/lib/patients/actions', () => ({ setPatientStatus: vi.fn(), createPatient: vi.fn(), updatePatient: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const patients = (active: number): Patient[] =>
  Array.from({ length: active }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, full_name: `Paciente ${i}`, status: 'active' }) as Patient);

describe('vagas do plano', () => {
  it('avisa com 2 vagas restantes e bloqueia no limite', () => {
    expect(seatsInfo(17, 20)).toEqual({ level: 'ok', remaining: 3 });
    expect(seatsInfo(18, 20)).toEqual({ level: 'warning', remaining: 2 });
    expect(seatsInfo(20, 20)).toEqual({ level: 'full', remaining: 0 });
    expect(seatsInfo(500, null)).toEqual({ level: 'unlimited', remaining: null });
    expect(seatsMessage(18, 20)).toBe('Restam 2 vagas de pacientes ativos no plano gratuito.');
    expect(seatsMessage(19, 20)).toBe('Resta 1 vaga de paciente ativo no plano gratuito.');
    expect(seatsMessage(20, 20)).toBe('Você atingiu o limite de 20 pacientes ativos do plano gratuito.');
    expect(seatsMessage(5, 20)).toBeNull();
  });
  it('getEntitlements do plano gratuito', () => {
    const e = getEntitlements('free');
    expect(e.maxActivePatients).toBe(20);
    expect(e.maxMembers).toBe(1);
    expect(e.modules).toEqual(expect.arrayContaining(['clinical', 'patient_area', 'ai']));
    expect(e.modules).not.toContain('practice');
  });
});

describe('lista de pacientes', () => {
  it('com 18 ativos mostra que restam 2 vagas', () => {
    render(<PatientsList patients={patients(18)} limit={20} planName="Gratuito" demoHref="/x" />);
    expect(screen.getByText(/Restam 2 vagas/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Novo paciente/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('no limite bloqueia o cadastro e leva ao plano pago', () => {
    render(<PatientsList patients={patients(20)} limit={20} planName="Gratuito" demoHref="/x" />);
    expect((screen.getByRole('button', { name: /Novo paciente/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('link', { name: /registre interesse no plano pago/ }).getAttribute('href')).toBe('/app/configuracoes/plano#interesse');
  });
});

describe('WaitlistForm', () => {
  it('registra o interesse e mostra a confirmação', async () => {
    render(<WaitlistForm registeredAt={null} initialPlan={null} canRegister />);
    fireEvent.click(screen.getByRole('radio', { name: /Profissional/ }));
    fireEvent.change(screen.getByLabelText(/O que você mais precisa/), { target: { value: 'Mais pacientes' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Quero o plano pago' })));
    expect(joinWaitlist).toHaveBeenCalledWith('professional', 'Mais pacientes');
    expect(screen.getByRole('status').textContent).toMatch(/Interesse registrado/);
  });
  it('mostra o erro e não confirma', async () => {
    joinWaitlist.mockResolvedValueOnce({ ok: false, message: 'Não foi possível registrar agora.' });
    render(<WaitlistForm registeredAt={null} initialPlan={null} canRegister />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Quero o plano pago' })));
    expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível/);
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('quem não é owner não registra', () => {
    render(<WaitlistForm registeredAt={null} initialPlan={null} canRegister={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
