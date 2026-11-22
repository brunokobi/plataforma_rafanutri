import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, googleAuthUrl, googleErrorMessage, googleRedirectUri, mapGoogleError } from '@/lib/auth/google';

const s = { state: 'a'.repeat(32), nonce: 'b'.repeat(32), next: '/app/pacientes', intent: 'signup' as const };

describe('login pelo Google', () => {
  it('state no cookie: ida e volta, e recusa conteúdo adulterado', () => {
    expect(decodeState(encodeState(s))).toEqual(s);
    expect(decodeState(encodeState({ ...s, next: 'https://evil.com' }))?.next).toBe('/app');
    expect(decodeState(encodeState({ ...s, intent: 'admin' as never }))?.intent).toBe('login');
    expect(decodeState(encodeState({ ...s, state: 'curto' }))).toBeNull();
    expect(decodeState('%%%')).toBeNull();
    expect(decodeState(undefined)).toBeNull();
  });

  it('URL de autorização com escopos mínimos, state e nonce', () => {
    const u = new URL(googleAuthUrl({ clientId: 'cid', redirectUri: 'https://x.com/api/auth/google/callback', state: 'st', nonce: 'no' }));
    expect(u.origin).toBe('https://accounts.google.com');
    expect(u.searchParams.get('scope')).toBe('openid email profile');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('nonce')).toBe('no');
  });

  it('endereço de retorno e mensagens', () => {
    expect(googleRedirectUri('https://rafanutri.brunokobi.tech/')).toBe('https://rafanutri.brunokobi.tech/api/auth/google/callback');
    expect(mapGoogleError('NO_ACCOUNT')).toBe('sem_conta');
    expect(mapGoogleError('QUALQUER')).toBe('falha');
    expect(googleErrorMessage('sem_conta')).toMatch(/Crie a sua conta/);
    expect(googleErrorMessage('toString')).toBeNull();
    expect(googleErrorMessage(undefined)).toBeNull();
  });
});
