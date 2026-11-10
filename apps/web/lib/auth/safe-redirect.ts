export const DEFAULT_AFTER_LOGIN = '/app';

/**
 * Só aceita caminhos internos ("/algo"), nunca URLs absolutas nem "//host"
 * (proteção contra open redirect).
 */
export function safeRedirect(target: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  if (!target || typeof target !== 'string') return fallback;
  const value = target.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  if (value === '/login' || value.startsWith('/login?')) return fallback;
  return value;
}
