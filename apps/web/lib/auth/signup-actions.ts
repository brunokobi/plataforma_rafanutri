'use server';

import { customEndpoint, login, registerUser, withToken } from '@directus/sdk';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { isSignupOpen } from '@/lib/flags';
import { onboardingSchema, type OnboardingInput } from '@/lib/validation/onboarding';
import { signupSchema, type SignupInput } from '@/lib/validation/signup';
import { ACCESS_COOKIE, sessionCookies } from './cookies';
import { directus, directusErrorInfo } from './directus';

export type ActionResult =
  | { status: 'closed' }
  | { status: 'ok' }
  | { status: 'invalid'; message: string }
  | { status: 'error'; message: string };

export async function signUp(input: SignupInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { status: 'invalid', message: parsed.error.issues[0]?.message ?? 'Revise os campos.' };
  if (!isSignupOpen()) return { status: 'closed' };

  const { full_name, email, password } = parsed.data;
  const [first_name, ...rest] = full_name.trim().split(/\s+/);
  try {
    await directus().request(
      registerUser(email.toLowerCase(), password, {
        first_name,
        last_name: rest.join(' '),
        verification_url: `${env.NEXT_PUBLIC_SITE_URL}/cadastro/verificar`,
      }),
    );
  } catch (error) {
    const { status, code } = directusErrorInfo(error);
    if (status === 429) return { status: 'error', message: 'Muitas tentativas. Aguarde um minuto.' };
    // E-mail já cadastrado: resposta neutra, sem confirmar que a conta existe.
    if (code === 'RECORD_NOT_UNIQUE') return { status: 'ok' };
    console.error('signUp: falha no Directus', { status, code });
    return { status: 'error', message: 'Não foi possível criar a conta agora. Tente novamente em instantes.' };
  }

  // Sem verificação por e-mail (o Directus ainda não tem servidor de e-mail), a conta já nasce
  // ativa: entra direto e segue para o onboarding. Se o login falhar, a tela orienta a entrar.
  let tokens;
  try {
    tokens = await directus().request(login({ email: email.toLowerCase(), password }, { mode: 'json' }));
  } catch (error) {
    console.error('signUp: conta criada, mas o login automático falhou', directusErrorInfo(error));
    return { status: 'ok' };
  }
  const store = await cookies();
  for (const c of sessionCookies(tokens)) store.set(c.name, c.value, c.options);
  redirect('/onboarding');
}

export async function completeOnboarding(input: OnboardingInput): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { status: 'invalid', message: parsed.error.issues[0]?.message ?? 'Revise os campos.' };

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) redirect('/login?next=/onboarding');
  if (!isSignupOpen()) return { status: 'closed' };

  const d = parsed.data;
  try {
    await directus().request(
      withToken(
        token,
        customEndpoint({
          path: '/rafanutri/organizations',
          method: 'POST',
          body: JSON.stringify({
            name: d.practice_name,
            type: d.practice_type,
            brand_color: d.brand_color,
            crn: d.crn,
            crn_region: d.crn_region,
          }),
        }),
      ),
    );
  } catch (error) {
    const { status, code } = directusErrorInfo(error);
    console.error('completeOnboarding: falha no Directus', { status, code });
    return { status: 'error', message: 'Não foi possível criar o consultório agora. Tente novamente em instantes.' };
  }
  redirect('/app');
}
