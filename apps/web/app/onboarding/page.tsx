import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { ThemeToggle } from '@/components/theme-toggle';
import { getCurrentUser } from '@/lib/auth/session';
import { isSignupOpen } from '@/lib/flags';

export const metadata: Metadata = { title: 'Configure seu consultório', robots: { index: false } };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/onboarding');
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Logo href="/app" />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Configure seu consultório</h1>
        <p className="mt-2 text-muted-foreground">Leva menos de 3 minutos. Você pode mudar tudo depois.</p>
        <div className="mt-8">
          <OnboardingWizard defaultName={name} signupOpen={isSignupOpen()} />
        </div>
      </main>
    </div>
  );
}
