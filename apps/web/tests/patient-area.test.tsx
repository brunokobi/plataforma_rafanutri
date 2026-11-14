import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatePasswordForm } from '@/components/patient-area/invite-accept';
import { inviteWhatsappLink, PatientAppAccess } from '@/components/patients/patient-app-access';
import { brasiliaMinutes, mealOfTheMoment } from '@/lib/patient-area/meal-now';
import type { AppAccess } from '@/lib/patient-area/types';

type R = { ok: true; data?: { link: string; expires_at: string } } | { ok: false; message: string; field?: string };
const invitePatient = vi.fn<(id: string, email: string) => Promise<R>>(async () => ({ ok: true, data: { link: 'https://x/p/convite/abc', expires_at: '2026-11-21T12:00:00Z' } }));
const revokeAppAccess = vi.fn<(id: string) => Promise<R>>(async () => ({ ok: true }));
const acceptInviteWithPassword = vi.fn<(t: string, p: string, c: string) => Promise<R>>(async () => ({ ok: false, message: 'As senhas não conferem.', field: 'confirm' }));
vi.mock('@/lib/patient-area/actions', () => ({
  invitePatient: (id: string, e: string) => invitePatient(id, e),
  revokeAppAccess: (id: string) => revokeAppAccess(id),
  acceptInviteWithPassword: (t: string, p: string, c: string) => acceptInviteWithPassword(t, p, c),
  acceptInviteLoggedIn: vi.fn(),
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const at = (hhmm: string) => new Date(`2026-11-14T${hhmm}:00-03:00`);
const MEALS = [
  { id: 'c', name: 'Café', time: '07:30', items: 3 },
  { id: 'a', name: 'Almoço', time: '12:30', items: 5 },
  { id: 'j', name: 'Jantar', time: '19:30', items: 4 },
];

describe('refeição do momento (horário de Brasília)', () => {
  it('converte para Brasília', () => {
    expect(brasiliaMinutes(at('00:10'))).toBe(10);
    expect(brasiliaMinutes(at('23:59'))).toBe(23 * 60 + 59);
  });
  it('em curso até 90 min depois; senão a próxima; depois do jantar, o café', () => {
    expect(mealOfTheMoment(MEALS, at('12:45'))).toEqual({ meal: MEALS[1], when: 'now' });
    expect(mealOfTheMoment(MEALS, at('15:00'))).toEqual({ meal: MEALS[2], when: 'next' });
    expect(mealOfTheMoment(MEALS, at('06:00'))).toEqual({ meal: MEALS[0], when: 'next' });
    expect(mealOfTheMoment(MEALS, at('22:00'))).toEqual({ meal: MEALS[0], when: 'next' });
    expect(mealOfTheMoment([], at('12:00'))).toBeNull();
    expect(mealOfTheMoment([{ id: 'x', name: 'Livre', time: null, items: 1 }], at('12:00'))?.meal.id).toBe('x');
  });
});

const access = (extra: Partial<AppAccess> = {}): AppAccess => ({ linked: false, email: null, activated_at: null, invite: null, patient_email: 'rafa@exemplo.com', active: true, ...extra });

describe('PatientAppAccess (nutricionista)', () => {
  it('convida com o e-mail do cadastro e mostra o link com WhatsApp', async () => {
    render(<PatientAppAccess patientId="p1" access={access()} firstName="Rafael" phone="+5531999990000" />);
    expect(screen.getByText('Sem acesso')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Convidar para a área do paciente' }));
    expect((screen.getByLabelText(/E-mail de acesso/) as HTMLInputElement).value).toBe('rafa@exemplo.com');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Gerar link/ })));
    expect(invitePatient).toHaveBeenCalledWith('p1', 'rafa@exemplo.com');
    expect((screen.getByLabelText('Link do convite') as HTMLInputElement).value).toBe('https://x/p/convite/abc');
    expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toContain('wa.me/5531999990000');
  });
  it('mostra erro do servidor (e-mail de profissional)', async () => {
    invitePatient.mockResolvedValueOnce({ ok: false, message: 'Este e-mail é de uma conta de profissional; use outro e-mail para o paciente.', field: 'email' });
    render(<PatientAppAccess patientId="p1" access={access()} firstName="Rafael" phone={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Convidar para a área do paciente' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Gerar link/ })));
    expect(screen.getByRole('alert').textContent).toMatch(/conta de profissional/);
  });
  it('acesso ativo: revogar com confirmação', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PatientAppAccess patientId="p1" access={access({ linked: true, email: 'rafa@exemplo.com', activated_at: '2026-11-10T12:00:00Z' })} firstName="Rafael" phone={null} />);
    expect(screen.getByText('Acesso ativo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Convidar/ })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Revogar acesso' })));
    expect(revokeAppAccess).toHaveBeenCalledWith('p1');
  });
  it('paciente arquivado não recebe convite', () => {
    render(<PatientAppAccess patientId="p1" access={access({ active: false })} firstName="Rafael" phone={null} />);
    expect(screen.queryByRole('button', { name: /Convidar/ })).toBeNull();
    expect(screen.getByText(/arquivado não acessa/)).toBeTruthy();
  });
  it('mensagem do WhatsApp com o link', () => {
    expect(decodeURIComponent(inviteWhatsappLink(null, 'Ana', 'https://l'))).toContain('Olá, Ana!');
  });
});

describe('CreatePasswordForm (paciente)', () => {
  it('envia senha e confirmação e mostra o erro', async () => {
    render(<CreatePasswordForm token="t" email="rafa@exemplo.com" />);
    fireEvent.change(screen.getByLabelText('Crie uma senha'), { target: { value: 'segredo123' } });
    fireEvent.change(screen.getByLabelText('Repita a senha'), { target: { value: 'segredo124' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })));
    expect(acceptInviteWithPassword).toHaveBeenCalledWith('t', 'segredo123', 'segredo124');
    expect(screen.getByRole('alert').textContent).toBe('As senhas não conferem.');
  });
});

describe('datas no horário de Brasília', async () => {
  const { dateBR } = await import('@/lib/format/date');
  it('data com hora em UTC cai no dia de Brasília; data sem hora é o próprio dia', () => {
    expect(dateBR('2026-11-11T01:30:00Z')).toBe('10 de nov. de 2026');
    expect(dateBR('2026-11-11')).toBe('11 de nov. de 2026');
    expect(dateBR('2026-11-11', { day: '2-digit', month: 'short' })).toBe('11 de nov.');
  });
});
