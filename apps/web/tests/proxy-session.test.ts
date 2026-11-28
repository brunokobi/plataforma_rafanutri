import { describe, expect, it } from 'vitest';
import { accessValid, tokenExp } from '@/proxy';

const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

describe('sessão no proxy', () => {
  it('lê a validade do token de acesso', () => {
    expect(tokenExp(jwt({ exp: 1800000000 }))).toBe(1800000000);
    expect(tokenExp('lixo')).toBeNull();
    expect(tokenExp(undefined)).toBeNull();
  });
  it('token vencido não conta como sessão (evita o laço /login ↔ /app)', () => {
    const now = 1_800_000_000_000;
    expect(accessValid(jwt({ exp: now / 1000 + 600 }), now)).toBe(true);
    expect(accessValid(jwt({ exp: now / 1000 - 1 }), now)).toBe(false);
    expect(accessValid(jwt({ exp: now / 1000 + 5 }), now)).toBe(false);
    expect(accessValid(undefined, now)).toBe(false);
    expect(accessValid('sem-exp', now)).toBe(true);
  });
});
