'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { signIn } from '@/lib/auth/actions';
import { cn } from '@/lib/utils';
import { loginSchema, type LoginInput } from '@/lib/validation/login';

// Campos no padrão da tela de login (escuro do desenho; versão clara no tema claro).
const FIELD =
  'h-12 w-full rounded-xl border border-[#d9e1d6] bg-white px-3.5 text-[15px] text-[#17241b] placeholder:text-[#8a9a8e] focus:border-[#6cc56f] focus:outline-none focus:ring-[3px] focus:ring-[#6cc56f]/25 dark:border-[#263429] dark:bg-[#121c15] dark:text-[#eef3ee] dark:placeholder:text-[#6f8576] aria-[invalid=true]:border-destructive';
const LABEL = 'text-sm font-semibold text-[#17241b] dark:text-[#eef3ee]';
const LINK = 'text-sm font-semibold text-[#2f7a3d] hover:text-[#1f5a2a] dark:text-[#7fd483] dark:hover:text-[#a6e6a8]';

export function LoginForm({ next, emailPlaceholder = 'voce@consultorio.com.br' }: { next?: string; emailPlaceholder?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', next, remember: true },
    mode: 'onTouched',
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signIn(values);
      // Em caso de sucesso, a Server Action redireciona e não retorna.
      if (result && !result.ok) {
        setServerError(result.message);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as 'email' | 'password', { message });
        }
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]" aria-describedby={serverError ? 'login-error' : undefined}>
      {serverError && (
        <div role="alert" id="login-error" className="flex items-start gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3.5 py-3 text-sm text-destructive dark:text-[#ff9b8f]">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className={LABEL}>E-mail</label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={emailPlaceholder}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={FIELD}
          {...form.register('email')}
        />
        {errors.email && <p id="email-error" className="text-sm text-destructive dark:text-[#ff9b8f]">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className={LABEL}>Senha</label>
          <Link href="/recuperar-senha" className={LINK}>Esqueci minha senha</Link>
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            className={cn(FIELD, 'pr-12')}
            {...form.register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={showPassword}
            className="absolute top-0.5 right-0.5 grid size-11 place-items-center rounded-[10px] text-[#5b6a60] hover:text-[#17241b] focus-visible:outline-2 focus-visible:outline-[#6cc56f] dark:text-[#9fb2a4] dark:hover:text-[#eef3ee]"
          >
            {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        </div>
        {errors.password && <p id="password-error" className="text-sm text-destructive dark:text-[#ff9b8f]">{errors.password.message}</p>}
      </div>

      <label className="flex min-h-7 cursor-pointer items-center gap-2.5 text-sm text-[#4b5d52] dark:text-[#b7c7bb]">
        <input type="checkbox" className="size-[18px] accent-[#6cc56f]" {...form.register('remember')} />
        Lembrar de mim neste dispositivo
      </label>

      <input type="hidden" {...form.register('next')} />

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-[50px] items-center justify-center gap-2 rounded-xl bg-[#6cc56f] text-base font-bold text-[#0b1f10] transition-colors hover:bg-[#7fd483] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7fd483] disabled:opacity-70"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Entrando…
          </>
        ) : (
          <>
            Entrar <ArrowRight className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
