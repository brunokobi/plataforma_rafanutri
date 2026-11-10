'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { PasswordMeter } from '@/components/auth/password-meter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp, type ActionResult } from '@/lib/auth/signup-actions';
import { signupSchema, type SignupInput } from '@/lib/validation/signup';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function SignupForm({ signupOpen }: { signupOpen: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { full_name: '', email: '', password: '', confirm_password: '', accept_terms: false },
    mode: 'onTouched',
  });
  const { errors } = form.formState;
  const password = useWatch({ control: form.control, name: 'password' });

  const onSubmit = form.handleSubmit((values) => {
    setResult(null);
    startTransition(async () => setResult(await signUp(values)));
  });

  if (result?.status === 'ok') {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Confira seu e-mail</AlertTitle>
        <AlertDescription>Enviamos um link para ativar sua conta. Depois é só entrar e configurar seu consultório.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {!signupOpen && (
        <Alert>
          <Info />
          <AlertTitle>Pré-lançamento</AlertTitle>
          <AlertDescription>O cadastro abre em breve. Você pode conhecer o formulário, mas nada é salvo ainda.</AlertDescription>
        </Alert>
      )}
      {result?.status === 'closed' && (
        <Alert>
          <Info />
          <AlertDescription>Tudo certo com os seus dados, mas o cadastro ainda não está aberto. Nenhuma informação foi salva.</AlertDescription>
        </Alert>
      )}
      {(result?.status === 'error' || result?.status === 'invalid') && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="full_name">Nome completo</Label>
        <Input
          id="full_name"
          autoComplete="name"
          placeholder="Ana Souza"
          className="h-11"
          aria-invalid={Boolean(errors.full_name)}
          aria-describedby={errors.full_name ? 'full_name-error' : undefined}
          {...form.register('full_name')}
        />
        <FieldError id="full_name-error" message={errors.full_name?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="voce@consultorio.com.br"
          className="h-11"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...form.register('email')}
        />
        <FieldError id="email-error" message={errors.email?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="h-11 pr-11"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={`password-meter${errors.password ? ' password-error' : ''}`}
            {...form.register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <PasswordMeter id="password-meter" value={password} />
        <FieldError id="password-error" message={errors.password?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm_password">Confirmar senha</Label>
        <Input
          id="confirm_password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          className="h-11"
          aria-invalid={Boolean(errors.confirm_password)}
          aria-describedby={errors.confirm_password ? 'confirm_password-error' : undefined}
          {...form.register('confirm_password')}
        />
        <FieldError id="confirm_password-error" message={errors.confirm_password?.message} />
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <Controller
            control={form.control}
            name="accept_terms"
            render={({ field }) => (
              <Checkbox
                id="accept_terms"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                onBlur={field.onBlur}
                aria-invalid={Boolean(errors.accept_terms)}
                aria-describedby={errors.accept_terms ? 'accept_terms-error' : undefined}
                className="mt-0.5"
              />
            )}
          />
          <label htmlFor="accept_terms" className="text-sm leading-snug text-muted-foreground">
            Li e aceito os{' '}
            <Link href="/termos" className="font-medium text-primary underline-offset-4 hover:underline">Termos de uso</Link> e a{' '}
            <Link href="/privacidade" className="font-medium text-primary underline-offset-4 hover:underline">Política de privacidade</Link>.
          </label>
        </div>
        <FieldError id="accept_terms-error" message={errors.accept_terms?.message} />
      </div>

      <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={pending} aria-busy={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Criando conta…
          </>
        ) : (
          'Criar conta grátis'
        )}
      </Button>
    </form>
  );
}
