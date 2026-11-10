import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signIn = vi.fn();
vi.mock('@/lib/auth/actions', () => ({ signIn: (...args: unknown[]) => signIn(...args) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { LoginForm } = await import('@/components/auth/login-form');

afterEach(() => {
  cleanup();
  signIn.mockReset();
});

describe('LoginForm', () => {
  it('mostra erros de validação sem chamar o servidor', async () => {
    render(<LoginForm />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });
    expect(await screen.findByText('Informe seu e-mail.')).toBeTruthy();
    expect(screen.getByText('Informe sua senha.')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('mostra a mensagem neutra quando o servidor recusa o login', async () => {
    signIn.mockResolvedValue({ ok: false, message: 'E-mail ou senha incorretos.' });
    render(<LoginForm next="/app" />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@consultorio.com.br' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeTruthy();
    expect(signIn).toHaveBeenCalledWith({ email: 'ana@consultorio.com.br', password: 'errada', next: '/app' });
  });

  it('alterna a visibilidade da senha', () => {
    render(<LoginForm />);
    const input = screen.getByLabelText('Senha') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input.type).toBe('text');
  });
});
