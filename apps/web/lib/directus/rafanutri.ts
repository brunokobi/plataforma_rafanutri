// Cliente único dos endpoints da extensão (/rafanutri/*) para as Server Actions e páginas do servidor.
// Antes havia uma cópia de call() em cada lib/*/actions.ts, sem timeout e com pequenas diferenças.
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { env } from '@/lib/env';

/** Corpo de resposta da extensão: { data } no sucesso, { errors } na falha. */
export type RafanutriJson = null | {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  errors?: Array<{ message: string; extensions?: { code?: string; fields?: Record<string, string> } }>;
};

export interface CallResult { status: number; json: RafanutriJson }

/** Tempo máximo padrão de uma chamada (um Directus travado não pode prender a Server Action). */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Chama /rafanutri{path} com o token da sessão. Sem sessão (e auth=true): { status: 401, json: null } sem ir à rede.
 * Erro de rede ou tempo esgotado: { status: 0, json: null } (quem chama mostra a mensagem de falha).
 */
export async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  auth = true,
  extra: Record<string, string> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CallResult> {
  const token = auth ? (await cookies()).get(ACCESS_COOKIE)?.value : undefined;
  if (auth && !token) return { status: 401, json: null };
  const headers: Record<string, string> = { ...extra };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${env.DIRECTUS_URL}/rafanutri${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 204) return { status: 204, json: null };
    return { status: res.status, json: (await res.json().catch(() => null)) as RafanutriJson };
  } catch (error) {
    console.error(`rafanutri: falha ao chamar ${method} ${path}`, error instanceof Error ? error.name : error);
    return { status: 0, json: null };
  }
}
