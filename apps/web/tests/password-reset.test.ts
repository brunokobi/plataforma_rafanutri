import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPasswordReset, resetPassword } from '@/lib/auth/password-actions';

afterEach(() => vi.unstubAllGlobals());

describe('recuperação de senha', () => {
  it('pede o link com a URL de redefinição e responde neutro', async () => {
    const f = vi.fn().mockResolvedValue({ status: 204, ok: true });
    vi.stubGlobal('fetch', f);
    expect(await requestPasswordReset(' Ana@Exemplo.com ')).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toMatch(/\/auth\/password\/request$/);
    expect(JSON.parse(init.body)).toMatchObject({ email: 'ana@exemplo.com' });
    expect(JSON.parse(init.body).reset_url).toMatch(/\/redefinir-senha$/);
  });
  it('e-mail inválido não chama o servidor', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await requestPasswordReset('ana')).toMatchObject({ ok: false, field: 'email' });
    expect(f).not.toHaveBeenCalled();
  });
  it('senha nova: tamanho, confirmação e link expirado', async () => {
    expect(await resetPassword('t', '123', '123')).toMatchObject({ ok: false, field: 'password' });
    expect(await resetPassword('t', '12345678', '12345679')).toMatchObject({ ok: false, field: 'confirm' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));
    expect(await resetPassword('t', '12345678', '12345678')).toEqual({ ok: false, message: 'Este link expirou ou já foi usado. Peça um novo.' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204, ok: true }));
    expect(await resetPassword('t', '12345678', '12345678')).toEqual({ ok: true });
  });
});
