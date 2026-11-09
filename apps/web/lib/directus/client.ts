import 'server-only';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearedCookies, sessionCookies, type AuthTokens } from './session';

export class DirectusError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DirectusError';
  }
}

type Json = Record<string, unknown> | unknown[];

async function request<T>(path: string, init: { method?: string; body?: Json; token?: string | null } = {}): Promise<T> {
  const res = await fetch(`${env.DIRECTUS_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message: string; extensions?: { code?: string } }> };
  if (!res.ok) {
    const e = json.errors?.[0];
    throw new DirectusError(res.status, e?.extensions?.code ?? 'UNKNOWN', e?.message ?? `Erro ${res.status}`);
  }
  return json.data as T;
}

/** Token do usuário logado (renovado pelo middleware). */
export async function getToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export interface ItemQuery {
  fields?: string[];
  filter?: Record<string, unknown>;
  sort?: string[];
  limit?: number;
  offset?: number;
  search?: string;
  deep?: Record<string, unknown>;
  aggregate?: Record<string, string>;
}

function toParams(q: ItemQuery = {}): string {
  const p = new URLSearchParams();
  if (q.fields) p.set('fields', q.fields.join(','));
  if (q.filter) p.set('filter', JSON.stringify(q.filter));
  if (q.sort) p.set('sort', q.sort.join(','));
  if (q.limit !== undefined) p.set('limit', String(q.limit));
  if (q.offset !== undefined) p.set('offset', String(q.offset));
  if (q.search) p.set('search', q.search);
  if (q.deep) p.set('deep', JSON.stringify(q.deep));
  if (q.aggregate) for (const [fn, field] of Object.entries(q.aggregate)) p.set(`aggregate[${fn}]`, field);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Cliente com o token do usuário: tudo passa pelas permissões do Directus. */
export async function directus() {
  const token = await getToken();
  return {
    token,
    readItems: <T>(collection: string, q?: ItemQuery) => request<T[]>(`/items/${collection}${toParams(q)}`, { token }),
    readItem: <T>(collection: string, id: string, q?: ItemQuery) => request<T>(`/items/${collection}/${id}${toParams(q)}`, { token }),
    createItem: <T>(collection: string, body: Record<string, unknown>) => request<T>(`/items/${collection}`, { method: 'POST', body, token }),
    updateItem: <T>(collection: string, id: string, body: Record<string, unknown>) =>
      request<T>(`/items/${collection}/${id}`, { method: 'PATCH', body, token }),
    deleteItem: (collection: string, id: string) => request<void>(`/items/${collection}/${id}`, { method: 'DELETE', token }),
    me: <T>(fields = ['id', 'email', 'first_name', 'last_name']) => request<T>(`/users/me?fields=${fields.join(',')}`, { token }),
    call: <T>(path: string, method = 'GET', body?: Json) => request<T>(path, { method, body, token }),
  };
}

/** Chamada sem sessão (cadastro, login). */
export const publicRequest = request;

export async function signIn(email: string, password: string) {
  const tokens = await request<AuthTokens>('/auth/login', { method: 'POST', body: { email, password, mode: 'json' } });
  const store = await cookies();
  for (const c of sessionCookies(tokens)) store.set(c.name, c.value, c.options);
}

export async function signOut() {
  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    await request('/auth/logout', { method: 'POST', body: { refresh_token: refresh, mode: 'json' } }).catch(() => undefined);
  }
  for (const c of clearedCookies()) store.set(c.name, c.value, c.options);
}
