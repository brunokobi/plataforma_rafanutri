/**
 * Cadastro e onboarding só gravam no Directus quando SIGNUP_OPEN=true.
 * Desligado por padrão até a Fase 0 do banco ser liberada (docs/specs/cadastro-onboarding.md).
 */
export function isSignupOpen(): boolean {
  return process.env.SIGNUP_OPEN === 'true';
}
