import { createDirectus, isDirectusError, rest } from '@directus/sdk';
import { env } from '@/lib/env';

/** Cliente REST do Directus para uso exclusivo no servidor. */
export function directus() {
  return createDirectus(env.DIRECTUS_URL).with(rest({ onRequest: (options) => ({ ...options, cache: 'no-store' }) }));
}

/** Código e status de um erro do Directus. */
export function directusErrorInfo(error: unknown): { status: number | null; code: string | null } {
  if (isDirectusError(error)) {
    return { status: error.response?.status ?? null, code: error.errors?.[0]?.extensions?.code ?? null };
  }
  return { status: null, code: null };
}
