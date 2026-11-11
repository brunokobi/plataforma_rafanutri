import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCpf, isUuid, maskCpf, patientFormSchema, toFormValues, toPatientUpdate, type Patient } from '@/lib/patients/schema';

const updatePatient = vi.fn();
const setPatientStatus = vi.fn();
const refresh = vi.fn();
vi.mock('@/lib/patients/actions', () => ({
  createPatient: vi.fn(),
  updatePatient: (...a: unknown[]) => updatePatient(...a),
  setPatientStatus: (...a: unknown[]) => setPatientStatus(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const { PatientRecord } = await import('@/components/patients/patient-record');

const patient: Patient = {
  id: '3f6c1e2a-9b7d-4c1e-8a2b-1c2d3e4f5a6b',
  full_name: 'Beatriz Nogueira',
  birth_date: '1981-03-15',
  sex: 'female',
  email: 'bia@exemplo.com.br',
  phone: '+5531999998888',
  cpf: '52998224725',
  objective: 'Controle glicêmico',
  status: 'active',
  created_at: '2026-11-10T21:00:00Z',
  updated_at: null,
};

afterEach(() => {
  cleanup();
  updatePatient.mockReset();
  setPatientStatus.mockReset();
  refresh.mockReset();
});

describe('utilitários da ficha', () => {
  it('formata e mascara o CPF', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(maskCpf('52998224725')).toBe('•••.•••.247-25');
  });
  it('edição limpa campos opcionais vazios (null) e mantém o nome', () => {
    const data = patientFormSchema.parse({ full_name: 'Ana Souza', birth_date: '', email: '', phone: '', cpf: '', objective: '' });
    expect(toPatientUpdate(data)).toEqual({
      full_name: 'Ana Souza', birth_date: null, sex: null, email: null, phone: null, cpf: null, objective: null,
    });
  });
  it('converte o paciente para os valores do formulário', () => {
    expect(toFormValues(patient)).toMatchObject({ cpf: '529.982.247-25', phone: '+5531999998888', sex: 'female' });
  });
  it('valida uuid', () => {
    expect(isUuid(patient.id)).toBe(true);
    expect(isUuid('exemplo')).toBe(false);
  });
});

describe('PatientRecord', () => {
  it('mostra os dados com CPF mascarado e revela ao pedir', () => {
    render(<PatientRecord patient={patient} activeLimitReached={false} />);
    expect(screen.getByRole('heading', { name: 'Beatriz Nogueira' })).toBeTruthy();
    expect(screen.getByText('Controle glicêmico')).toBeTruthy();
    expect(screen.getByText('(31) 99999-8888')).toBeTruthy();
    expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toBe('https://wa.me/5531999998888');
    expect(screen.getByTestId('patient-cpf').textContent).toBe('•••.•••.247-25');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar CPF' }));
    expect(screen.getByTestId('patient-cpf').textContent).toBe('529.982.247-25');
  });

  it('edita com o formulário já preenchido e atualiza a página', async () => {
    updatePatient.mockResolvedValue({ ok: true });
    render(<PatientRecord patient={patient} activeLimitReached={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar dados/ }));
    const objective = screen.getByLabelText('Objetivo (opcional)') as HTMLInputElement;
    expect(objective.value).toBe('Controle glicêmico');
    fireEvent.change(objective, { target: { value: 'Controle glicêmico e perda de peso' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' })));
    expect(updatePatient).toHaveBeenCalledWith(patient.id, expect.objectContaining({ objective: 'Controle glicêmico e perda de peso' }));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByText('Dados atualizados.')).toBeTruthy();
  });

  it('arquiva e mostra o erro do servidor', async () => {
    setPatientStatus.mockResolvedValue({ ok: false, message: 'Você não tem permissão para fazer isso neste consultório.' });
    render(<PatientRecord patient={patient} activeLimitReached={false} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Arquivar/ })));
    expect(setPatientStatus).toHaveBeenCalledWith(patient.id, 'archived');
    expect(await screen.findByText(/não tem permissão/)).toBeTruthy();
  });

  it('não deixa reativar com o limite do plano cheio', () => {
    render(<PatientRecord patient={{ ...patient, status: 'archived' }} activeLimitReached />);
    expect((screen.getByRole('button', { name: /Reativar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('patient-status').textContent).toBe('Arquivado');
  });
});
