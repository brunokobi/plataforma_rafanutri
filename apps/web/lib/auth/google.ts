import { env } from '@/lib/env';
import { safeRedirect } from './safe-redirect';

/** Cookie com o estado do login pelo Google (state, nonce, destino e intenção), válido por 10 minutos. */
export const GOOGLE_STATE_COOKIE = 'rn_g';
export const GOOGLE_STATE_MAX_AGE = 600;

export type GoogleIntent = 'login' | 'signup';
export interface GoogleState { state: string; nonce: string; next: string; intent: GoogleIntent }

export const googleRedirectUri = (siteUrl = env.NEXT_PUBLIC_SITE_URL) => `${siteUrl.replace(/\/$/, '')}/api/auth/google/callback`;

/** Endereço de autorização do Google (OpenID Connect, só e-mail e perfil). */
export function googleAuthUrl({ clientId, redirectUri, state, nonce }: { clientId: string; redirectUri: string; state: string; nonce: string }): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export function encodeState(s: GoogleState): string {
  return Buffer.from(JSON.stringify(s)).toString('base64url');
}

export function decodeState(raw: string | undefined): GoogleState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof v?.state !== 'string' || typeof v?.nonce !== 'string' || v.state.length < 16 || v.nonce.length < 16) return null;
    return { state: v.state, nonce: v.nonce, next: safeRedirect(v.next), intent: v.intent === 'signup' ? 'signup' : 'login' };
  } catch {
    return null;
  }
}

/** Códigos de erro que voltam para a tela (?google=...) e as mensagens mostradas. */
export const GOOGLE_ERRORS = {
  cancelado: 'Login com o Google cancelado.',
  expirado: 'O login com o Google expirou. Tente de novo.',
  sem_conta: 'Não há conta com este e-mail do Google. Crie a sua conta para continuar.',
  inativa: 'Esta conta não está ativa. Fale com o seu nutricionista ou com o suporte.',
  duas_etapas: 'Esta conta usa verificação em duas etapas. Entre com e-mail, senha e código.',
  nao_verificado: 'Confirme o seu e-mail no Google antes de entrar.',
  fechado: 'O cadastro de novas contas está fechado no momento.',
  indisponivel: 'Entrar com o Google não está disponível agora.',
  falha: 'Não foi possível entrar com o Google agora. Tente novamente em instantes.',
} as const;
export type GoogleError = keyof typeof GOOGLE_ERRORS;

export function googleErrorMessage(code: string | undefined): string | null {
  return code && Object.hasOwn(GOOGLE_ERRORS, code) ? GOOGLE_ERRORS[code as GoogleError] : null;
}

/** Código de erro da extensão → código da tela. */
export function mapGoogleError(code: string | undefined): GoogleError {
  switch (code) {
    case 'NO_ACCOUNT': return 'sem_conta';
    case 'USER_INACTIVE': return 'inativa';
    case 'TFA_REQUIRED': return 'duas_etapas';
    case 'EMAIL_NOT_VERIFIED': return 'nao_verificado';
    case 'SIGNUP_CLOSED': return 'fechado';
    case 'GOOGLE_DISABLED': return 'indisponivel';
    default: return 'falha';
  }
}

/** Configuração pública (client_id) vinda do Directus; null quando desligado. */
export async function googleConfig(): Promise<{ clientId: string } | null> {
  try {
    const r = await fetch(`${env.DIRECTUS_URL}/rafanutri/public/auth/google/config`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { data?: { enabled?: boolean; client_id?: string | null } };
    return j.data?.enabled && j.data.client_id ? { clientId: j.data.client_id } : null;
  } catch {
    return null;
  }
}
