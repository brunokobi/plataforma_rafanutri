// Entrar com o Google (OAuth 2.0 / OpenID Connect, fluxo "authorization code").
// O app (Next.js) manda a pessoa ao Google e recebe o código; aqui o código é trocado pela identidade
// com a chave secreta (só no .env do Directus), o e-mail verificado é ligado à conta que já existe
// ou vira uma conta nova de profissional, e a sessão é aberta pelo próprio Directus (/auth/refresh),
// com os mesmos tokens e regras do login com senha.
import { randomBytes } from 'node:crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const CODE = /^[\w\-./]{10,2048}$/;
const NONCE = /^[\w-]{16,128}$/;

/** Lê o payload de um JWT (sem conferir assinatura: o id_token veio direto do Google por TLS, OIDC §3.1.3.7). */
export function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return json && typeof json === 'object' && !Array.isArray(json) ? json : null;
  } catch {
    return null;
  }
}

/**
 * Confere as claims do id_token. Devolve { email, sub, first_name, last_name } ou { error }.
 * `now` em segundos.
 */
export function validateGoogleClaims(claims, { clientId, nonce, now = Math.floor(Date.now() / 1000) }) {
  if (!claims) return { error: 'invalid_token' };
  if (!ISSUERS.has(claims.iss)) return { error: 'invalid_issuer' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!clientId || !aud.includes(clientId)) return { error: 'invalid_audience' };
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) return { error: 'expired' };
  if (nonce && claims.nonce !== nonce) return { error: 'invalid_nonce' };
  if (claims.email_verified !== true && claims.email_verified !== 'true') return { error: 'email_not_verified' };
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: 'invalid_email' };
  if (typeof claims.sub !== 'string' || !claims.sub) return { error: 'invalid_token' };
  const clip = (s) => (typeof s === 'string' ? s.trim().slice(0, 50) : '');
  let first = clip(claims.given_name);
  let last = clip(claims.family_name);
  if (!first) {
    const [f = '', ...rest] = clip(claims.name).split(/\s+/);
    first = f;
    last = last || rest.join(' ');
  }
  return { email, sub: claims.sub, first_name: first || email.split('@')[0].slice(0, 50), last_name: last || null };
}

/** Corpo da troca do código no Google. */
export function tokenRequestBody({ code, clientId, clientSecret, redirectUri }) {
  return new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' });
}

/** Quem pode entrar pelo Google: conta ativa e sem 2FA (2FA exige o código, que este fluxo não pede). */
export function loginBlock(user) {
  if (!user) return null;
  if (user.status !== 'active') return 'inactive';
  if (user.tfa_secret) return 'tfa';
  return null;
}

const MESSAGES = {
  inactive: 'Esta conta não está ativa. Fale com o seu nutricionista ou com o suporte.',
  tfa: 'Esta conta usa verificação em duas etapas. Entre com e-mail, senha e código.',
  no_account: 'Não há conta com este e-mail. Crie a sua conta para continuar.',
  google: 'O Google não confirmou o acesso. Tente de novo.',
};

export function setupGoogleAuth({ router, database, logger, services, getSchema, env, recordTerms, fetchImpl = fetch }) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUris = String(env.GOOGLE_REDIRECT_URIS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const selfUrl = `http://127.0.0.1:${env.PORT ?? 8055}`;
  const fail = (res, status, code, message) => res.status(status).json({ errors: [{ message, extensions: { code } }] });

  async function exchange(code, redirectUri) {
    const r = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenRequestBody({ code, clientId, clientSecret, redirectUri }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body?.id_token) return null;
    return decodeJwtPayload(body.id_token);
  }

  async function createProfessional(identity) {
    const settings = await database('directus_settings').first('public_registration', 'public_registration_role');
    if (!settings?.public_registration || !settings.public_registration_role) return null;
    const users = new services.UsersService({ schema: await getSchema(), knex: database });
    return users.createOne({
      email: identity.email,
      first_name: identity.first_name,
      last_name: identity.last_name,
      role: settings.public_registration_role,
      status: 'active',
    });
  }

  /** Abre a sessão: grava um refresh token curto e deixa o Directus girá-lo, emitindo o access token. */
  async function openSession(userId, req) {
    const token = randomBytes(48).toString('base64url').slice(0, 64);
    await database('directus_sessions').insert({
      token,
      user: userId,
      expires: new Date(Date.now() + 120_000),
      ip: req.ip ?? null,
      user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : null,
      origin: null,
    });
    const r = await fetchImpl(`${selfUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token, mode: 'json' }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok || !body?.data?.access_token) {
      await database('directus_sessions').where({ token }).del().catch(() => undefined);
      return null;
    }
    return { access_token: body.data.access_token, refresh_token: body.data.refresh_token, expires: body.data.expires };
  }

  router.get('/public/auth/google/config', (_req, res) => {
    const enabled = Boolean(clientId && clientSecret && redirectUris.length);
    res.json({ data: { enabled, client_id: enabled ? clientId : null } });
  });

  // Corpo: { code, redirect_uri, nonce, create, accept_terms }. `create` só vem do cadastro (com os termos aceitos).
  router.post('/public/auth/google', async (req, res) => {
    if (!clientId || !clientSecret || !redirectUris.length) return fail(res, 503, 'GOOGLE_DISABLED', 'Entrar com o Google não está disponível.');
    const b = req.body ?? {};
    if (typeof b.code !== 'string' || !CODE.test(b.code)) return fail(res, 400, 'INVALID_PAYLOAD', 'Código inválido.');
    if (!redirectUris.includes(b.redirect_uri)) return fail(res, 400, 'INVALID_PAYLOAD', 'Endereço de retorno não autorizado.');
    if (typeof b.nonce !== 'string' || !NONCE.test(b.nonce)) return fail(res, 400, 'INVALID_PAYLOAD', 'Sessão de login inválida.');

    let claims;
    try {
      claims = await exchange(b.code, b.redirect_uri);
    } catch (error) {
      logger.error(`google-auth: falha na troca do código: ${error?.message}`);
      return fail(res, 502, 'GOOGLE_ERROR', MESSAGES.google);
    }
    const identity = validateGoogleClaims(claims, { clientId, nonce: b.nonce });
    if (identity.error) {
      logger.warn(`google-auth: id_token recusado (${identity.error})`);
      return fail(res, 401, identity.error === 'email_not_verified' ? 'EMAIL_NOT_VERIFIED' : 'GOOGLE_ERROR', identity.error === 'email_not_verified' ? 'Confirme o seu e-mail no Google antes de entrar.' : MESSAGES.google);
    }

    try {
      let user = await database('directus_users').whereRaw('lower(email) = ?', [identity.email]).first('id', 'status', 'tfa_secret');
      let created = false;
      if (!user) {
        if (b.create !== true || b.accept_terms !== true) return fail(res, 404, 'NO_ACCOUNT', MESSAGES.no_account);
        const id = await createProfessional(identity);
        if (!id) return fail(res, 403, 'SIGNUP_CLOSED', 'O cadastro de novas contas está fechado no momento.');
        await recordTerms(id, ['professional_terms', 'privacy'], req);
        user = { id, status: 'active', tfa_secret: null };
        created = true;
      }
      const block = loginBlock(user);
      if (block) return fail(res, 403, block === 'tfa' ? 'TFA_REQUIRED' : 'USER_INACTIVE', MESSAGES[block]);
      const tokens = await openSession(user.id, req);
      if (!tokens) return fail(res, 502, 'SESSION_ERROR', 'Não foi possível entrar agora. Tente novamente em instantes.');
      res.json({ data: { ...tokens, created } });
    } catch (error) {
      logger.error(`google-auth: falha ao abrir a sessão: ${error?.message}`);
      fail(res, 500, 'INTERNAL_SERVER_ERROR', 'Não foi possível entrar agora. Tente novamente em instantes.');
    }
  });
}
