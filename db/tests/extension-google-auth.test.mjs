// Testes do login pelo Google (regras puras e rota com Google e Directus simulados).
// Uso: node --test db/tests/extension-google-auth.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeJwtPayload, loginBlock, setupGoogleAuth, tokenRequestBody, validateGoogleClaims } from '../../directus/extensions/rafanutri/google-auth.js';

const CID = '123-abc.apps.googleusercontent.com';
const NOW = 1_800_000_000;
const jwt = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const good = { iss: 'https://accounts.google.com', aud: CID, exp: NOW + 3600, nonce: 'n'.repeat(20), email: 'Ana@Exemplo.com', email_verified: true, sub: '42', given_name: 'Ana', family_name: 'Souza' };

test('payload do JWT', () => {
  assert.deepEqual(decodeJwtPayload(jwt({ a: 1 })), { a: 1 });
  assert.equal(decodeJwtPayload('x.y'), null);
  assert.equal(decodeJwtPayload('a.###.c'), null);
  assert.equal(decodeJwtPayload(null), null);
});

test('claims: aceita e normaliza o e-mail', () => {
  assert.deepEqual(validateGoogleClaims(good, { clientId: CID, nonce: good.nonce, now: NOW }), { email: 'ana@exemplo.com', sub: '42', first_name: 'Ana', last_name: 'Souza' });
  const noGiven = validateGoogleClaims({ ...good, given_name: undefined, family_name: undefined, name: 'Bia Lima Rocha' }, { clientId: CID, nonce: good.nonce, now: NOW });
  assert.equal(noGiven.first_name, 'Bia');
  assert.equal(noGiven.last_name, 'Lima Rocha');
});

test('claims: recusa emissor, público, prazo, nonce e e-mail não verificado', () => {
  const v = (c, o = {}) => validateGoogleClaims({ ...good, ...c }, { clientId: CID, nonce: good.nonce, now: NOW, ...o }).error;
  assert.equal(v({ iss: 'https://evil.com' }), 'invalid_issuer');
  assert.equal(v({ aud: 'outro' }), 'invalid_audience');
  assert.equal(v({}, { clientId: undefined }), 'invalid_audience');
  assert.equal(v({ exp: NOW - 3600 }), 'expired');
  assert.equal(v({ nonce: 'x'.repeat(20) }), 'invalid_nonce');
  assert.equal(v({ email_verified: false }), 'email_not_verified');
  assert.equal(v({ email: 'sem-arroba' }), 'invalid_email');
  assert.equal(validateGoogleClaims(null, { clientId: CID }).error, 'invalid_token');
});

test('corpo da troca do código', () => {
  const b = tokenRequestBody({ code: 'c', clientId: CID, clientSecret: 's', redirectUri: 'https://app/cb' });
  assert.equal(b.get('grant_type'), 'authorization_code');
  assert.equal(b.get('redirect_uri'), 'https://app/cb');
});

test('quem pode entrar', () => {
  assert.equal(loginBlock({ status: 'active', tfa_secret: null }), null);
  assert.equal(loginBlock({ status: 'invited' }), 'inactive');
  assert.equal(loginBlock({ status: 'active', tfa_secret: 'x' }), 'tfa');
});

// ── Rota, com banco, Google e Directus simulados ──────────────────────────────────────────────
function harness({ users = [], registration = true } = {}) {
  const routes = {};
  const router = { get: (p, f) => (routes[`GET ${p}`] = f), post: (p, f) => (routes[`POST ${p}`] = f) };
  const sessions = [];
  const created = [];
  const terms = [];
  const database = (table) => {
    const q = {
      whereRaw: (_sql, [email]) => ({ first: async () => users.find((u) => u.email === email) }),
      first: async () => (table === 'directus_settings' ? { public_registration: registration, public_registration_role: 'role-pro' } : null),
      insert: async (row) => sessions.push(row),
      where: () => ({ del: async () => undefined }),
    };
    return q;
  };
  class UsersService { async createOne(u) { created.push(u); return 'new-user'; } }
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (url.startsWith('https://oauth2')) return { ok: true, json: async () => ({ id_token: jwt({ ...good, exp: Math.floor(Date.now() / 1000) + 600 }) }) };
    const { refresh_token } = JSON.parse(init.body);
    assert.equal(refresh_token, sessions.at(-1).token);
    return { ok: true, json: async () => ({ data: { access_token: 'at', refresh_token: 'rt2', expires: 900000 } }) };
  };
  setupGoogleAuth({
    router, database, logger: { error() {}, warn() {} }, services: { UsersService }, getSchema: async () => ({}),
    env: { GOOGLE_CLIENT_ID: CID, GOOGLE_CLIENT_SECRET: 's', GOOGLE_REDIRECT_URIS: 'https://app/cb' },
    recordTerms: async (id, docs) => terms.push([id, docs]), fetchImpl,
  });
  const call = async (body) => {
    let status = 200, json;
    const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
    await routes['POST /public/auth/google']({ body, headers: {}, ip: '1.2.3.4' }, res);
    return { status, json };
  };
  return { routes, call, sessions, created, terms, calls };
}
const body = { code: 'codigo-do-google', redirect_uri: 'https://app/cb', nonce: good.nonce };

test('conta existente: abre a sessão pelo Directus', async () => {
  const h = harness({ users: [{ id: 'u1', email: 'ana@exemplo.com', status: 'active', tfa_secret: null }] });
  const r = await h.call(body);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data, { access_token: 'at', refresh_token: 'rt2', expires: 900000, created: false });
  assert.equal(h.sessions[0].user, 'u1');
  assert.equal(h.sessions[0].token.length, 64);
  assert.equal(h.created.length, 0);
});

test('sem conta: só cria vindo do cadastro com os termos aceitos', async () => {
  const h = harness();
  assert.equal((await h.call(body)).json.errors[0].extensions.code, 'NO_ACCOUNT');
  assert.equal((await h.call({ ...body, create: true })).json.errors[0].extensions.code, 'NO_ACCOUNT');
  const r = await h.call({ ...body, create: true, accept_terms: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.created, true);
  assert.deepEqual(h.created[0], { email: 'ana@exemplo.com', first_name: 'Ana', last_name: 'Souza', role: 'role-pro', status: 'active' });
  assert.deepEqual(h.terms[0], ['new-user', ['professional_terms', 'privacy']]);
});

test('cadastro fechado, conta inativa, 2FA e entrada inválida', async () => {
  assert.equal((await harness({ registration: false }).call({ ...body, create: true, accept_terms: true })).json.errors[0].extensions.code, 'SIGNUP_CLOSED');
  assert.equal((await harness({ users: [{ id: 'u', email: 'ana@exemplo.com', status: 'suspended' }] }).call(body)).json.errors[0].extensions.code, 'USER_INACTIVE');
  assert.equal((await harness({ users: [{ id: 'u', email: 'ana@exemplo.com', status: 'active', tfa_secret: 'x' }] }).call(body)).json.errors[0].extensions.code, 'TFA_REQUIRED');
  const h = harness();
  assert.equal((await h.call({ ...body, redirect_uri: 'https://evil/cb' })).status, 400);
  assert.equal((await h.call({ ...body, nonce: 'curto' })).status, 400);
  assert.equal((await h.call({ ...body, code: '' })).status, 400);
  assert.equal(h.calls.length, 0);
});
