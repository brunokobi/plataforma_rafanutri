import { describe, expect, it } from 'vitest';
import { clearedCookies, sessionCookies } from '@/lib/auth/cookies';
import { DEFAULT_AFTER_LOGIN, safeRedirect } from '@/lib/auth/safe-redirect';
import { loginSchema } from '@/lib/validation/login';

describe('loginSchema', () => {
  it('aceita e-mail e senha válidos', () => {
    expect(loginSchema.safeParse({ email: ' ana@consultorio.com.br ', password: 'x' }).success).toBe(true);
  });
  it('rejeita e-mail inválido com mensagem em português', () => {
    const r = loginSchema.safeParse({ email: 'ana@', password: 'x' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Digite um e-mail válido.');
  });
  it('exige senha', () => {
    const r = loginSchema.safeParse({ email: 'ana@consultorio.com.br', password: '' });
    expect(r.error?.issues[0]?.message).toBe('Informe sua senha.');
  });
});

describe('safeRedirect (proteção contra open redirect)', () => {
  it.each([
    ['/app/pacientes', '/app/pacientes'],
    ['/app?tab=1', '/app?tab=1'],
  ])('aceita caminho interno %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
  it.each(['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '', '/login', '/login?next=/x', '/app\n'])(
    'recusa %j',
    (input) => {
      expect(safeRedirect(input)).toBe(DEFAULT_AFTER_LOGIN);
    },
  );
});

describe('cookies de sessão', () => {
  it('cria cookies httpOnly com as durações corretas', () => {
    const [access, refresh] = sessionCookies({ access_token: 'a', refresh_token: 'r', expires: 900_000 });
    expect(access).toMatchObject({ name: 'rn_at', value: 'a', options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 890 } });
    expect(refresh).toMatchObject({ name: 'rn_rt', value: 'r', options: { httpOnly: true, maxAge: 604800 } });
  });
  it('limpa a sessão quando o Directus não devolve tokens', () => {
    const cookies = sessionCookies({ access_token: null, refresh_token: null, expires: null });
    expect(cookies.every((c) => c.value === '' && c.options.maxAge === 0)).toBe(true);
    expect(clearedCookies()).toHaveLength(2);
  });
});
