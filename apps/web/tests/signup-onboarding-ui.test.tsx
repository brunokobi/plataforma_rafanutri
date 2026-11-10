import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signUp = vi.fn();
const completeOnboarding = vi.fn();
vi.mock('@/lib/auth/signup-actions', () => ({
  signUp: (...a: unknown[]) => signUp(...a),
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
// Radix usa ResizeObserver, que o jsdom não tem.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const { SignupForm } = await import('@/components/auth/signup-form');
const { OnboardingWizard } = await import('@/components/onboarding/onboarding-wizard');

afterEach(() => {
  cleanup();
  signUp.mockReset();
  completeOnboarding.mockReset();
});

const click = async (name: RegExp | string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('SignupForm', () => {
  it('avisa que é pré-lançamento e mostra erros sem chamar o servidor', async () => {
    render(<SignupForm signupOpen={false} />);
    expect(screen.getByText('Pré-lançamento')).toBeTruthy();
    await click('Criar conta grátis');
    expect(await screen.findByText('Informe seu nome completo.')).toBeTruthy();
    expect(screen.getByText('É preciso aceitar os termos para continuar.')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('mostra a força da senha enquanto digita', () => {
    render(<SignupForm signupOpen={false} />);
    fireEvent.change(screen.getByLabelText('Senha', { exact: true }), { target: { value: 'nutri2026' } });
    expect(screen.getByText('Boa')).toBeTruthy();
  });
});

describe('OnboardingWizard', () => {
  it('não avança com a etapa inválida e avança quando válida', async () => {
    render(<OnboardingWizard defaultName="Ana Souza" signupOpen={false} />);
    await click(/Continuar/);
    expect(await screen.findByText('Informe só os números do CRN (até 6 dígitos).')).toBeTruthy();
    expect(screen.getByText(/Etapa 1 de 4/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Número do CRN'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('Regional'), { target: { value: 'CRN-9' } });
    await click(/Continuar/);
    expect(await screen.findByText(/Etapa 2 de 4/)).toBeTruthy();
  });

  it('atualiza a pré-visualização com o nome do consultório', async () => {
    render(<OnboardingWizard defaultName="Ana Souza" signupOpen={false} />);
    fireEvent.change(screen.getByLabelText('Número do CRN'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('Regional'), { target: { value: 'CRN-9' } });
    await click(/Continuar/);
    await act(async () => {
      fireEvent.change(await screen.findByLabelText('Nome do consultório'), { target: { value: 'Ana Nutri' } });
    });
    expect(screen.getAllByTestId('preview-practice')[0]?.textContent).toBe('Ana Nutri');
  });
});
