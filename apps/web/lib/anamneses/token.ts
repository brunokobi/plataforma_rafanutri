import { createHash, randomBytes } from 'node:crypto';

/** Token do link público: 32 bytes aleatórios em base64url (43 caracteres). Só o hash vai para o banco. */
export function newAnamnesisToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashAnamnesisToken(token) };
}

export const hashAnamnesisToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const isAnamnesisToken = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
