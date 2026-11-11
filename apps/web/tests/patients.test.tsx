import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatPhoneBR, PatientsList } from '@/components/clinical/patients-list';
import { ageInYears, isValidCpf, patientFormSchema, phoneToE164, type Patient } from '@/lib/patients/schema';

type Result = { ok: true } | { ok: false; message: string };
const createPatient = vi.fn<(input: unknown) => Promise<Result>>(async () => ({ ok: true }));
const setPatientStatus = vi.fn<(id: string, status: string) => Promise<Result>>(async () => ({ ok: true }));
vi.mock('@/lib/patients/actions', () => ({
  createPatient: (i: unknown) => createPatient(i),
  setPatientStatus: (id: string, s: string) => setPatientStatus(id, s),
}));

afterEach(() => {
  cleanup();
  createPatient.mockClear();
  setPatientStatus.mockClear();
});

describe('validadores de paciente', () => {
  it('CPF com dígito verificador', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('52998224724')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });
  it('telefone brasileiro para E.164', () => {
    expect(phoneToE164('(31) 99999-8888')).toBe('+5531999998888');
    expect(phoneToE164('+55 31 3333-4444')).toBe('+553133334444');
    expect(phoneToE164('99999-8888')).toBeNull();
    expect(phoneToE164('(01) 99999-8888')).toBeNull();
    expect(formatPhoneBR('+5531999998888')).toBe('(31) 99999-8888');
  });
  it('idade em anos completos', () => {
    const today = new Date(2026, 10, 10); // 10/11/2026
    expect(ageInYears('1994-11-10', today)).toBe(32);
    expect(ageInYears('1994-11-11', today)).toBe(31);
  });
  it('schema normaliza CPF e telefone e ignora campos vazios', () => {
    const r = patientFormSchema.safeParse({ full_name: ' Ana Souza ', cpf: '529.982.247-25', phone: '(31) 99999-8888', email: '', birth_date: '' });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ full_name: 'Ana Souza', cpf: '52998224725', phone: '+5531999998888' });
    expect(r.data?.email).toBeUndefined();
  });
  it.each([
    [{ full_name: 'Ana' }, 'Informe nome e sobrenome.'],
    [{ full_name: 'Ana Souza', cpf: '123.456.789-00' }, 'CPF inválido.'],
    [{ full_name: 'Ana Souza', birth_date: '2999-01-01' }, 'A data de nascimento não pode ser no futuro.'],
    [{ full_name: 'Ana Souza', email: 'ana@' }, 'Digite um e-mail válido.'],
  ])('rejeita %j', (input, message) => {
    const r = patientFormSchema.safeParse(input);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(message);
  });
});

const patient = (id: string, full_name: string, status: Patient['status'] = 'active'): Patient => ({
  id, full_name, status, birth_date: null, sex: null, email: null, phone: null, objective: null, created_at: '2026-11-10T00:00:00Z',
});

describe('PatientsList', () => {
  it('lista os pacientes do banco, conta os ativos e busca sem acento', () => {
    render(<PatientsList patients={[patient('1', 'Márcia Lima'), patient('2', 'João Reis'), patient('3', 'Ana Velha', 'archived')]} limit={20} planName="Gratuito" demoHref="/x" />);
    expect(screen.getByText('2 de 20')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar paciente'), { target: { value: 'marcia' } });
    expect(screen.getByText('Márcia Lima')).toBeTruthy();
    expect(screen.queryByText('João Reis')).toBeNull();
  });

  it('bloqueia novo paciente quando o limite do plano está cheio', () => {
    const many = Array.from({ length: 20 }, (_, i) => patient(String(i), `Paciente Número ${i}`));
    render(<PatientsList patients={many} limit={20} planName="Gratuito" demoHref="/x" />);
    expect((screen.getByRole('button', { name: /Novo paciente/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/chegou ao limite de 20 pacientes ativos/)).toBeTruthy();
  });

  it('cadastra paciente pelo formulário e valida antes de enviar', async () => {
    render(<PatientsList patients={[]} limit={20} planName="Gratuito" demoHref="/x" />);
    fireEvent.click(screen.getByRole('button', { name: /Novo paciente/ }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar paciente' })));
    expect(createPatient).not.toHaveBeenCalled();
    expect(screen.getByText('Informe o nome completo.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Carla Dias' } });
    fireEvent.change(screen.getByLabelText('Celular (opcional)'), { target: { value: '(31) 98888-7777' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar paciente' })));
    expect(createPatient).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'Carla Dias', phone: '(31) 98888-7777' }));
    expect(screen.getByRole('status').textContent).toBe('Paciente cadastrado.');
  });

  it('arquiva e mostra erro vindo do servidor', async () => {
    setPatientStatus.mockResolvedValueOnce({ ok: false, message: 'Você não tem permissão.' });
    render(<PatientsList patients={[patient('1', 'Márcia Lima')]} limit={20} planName="Gratuito" demoHref="/x" />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Arquivar Márcia Lima' })));
    expect(setPatientStatus).toHaveBeenCalledWith('1', 'archived');
    expect(screen.getByRole('status').textContent).toBe('Você não tem permissão.');
  });

  it('avisa quando não consegue carregar', () => {
    render(<PatientsList patients={null} limit={20} planName="Gratuito" demoHref="/x" />);
    expect(screen.getByText(/Não foi possível carregar os pacientes/)).toBeTruthy();
  });
});
