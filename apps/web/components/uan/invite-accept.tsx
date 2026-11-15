'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptUnitInviteLoggedIn, acceptUnitInviteWithSignup } from '@/lib/uan/actions';

/** Primeiro acesso pela equipe: nome, e-mail e senha. */
export function StaffSignupForm({ token, defaultName }: { token: string; defaultName?: string }) {
  const [v, setV] = useState({ full_name: defaultName ?? '', email: '', password: '', confirm: '' });
  const [error, setError] = useState<{ message: string; fields?: Record<string, string>; accountExists?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const loginHref = `/login?next=${encodeURIComponent(`/uan/convite/${token}`)}`;
  const field = (k: keyof typeof v, label: string, props: React.ComponentProps<typeof Input>) => (
    <div className="space-y-1.5">
      <Label htmlFor={`staff-${k}`}>{label}</Label>
      <Input
        id={`staff-${k}`} className="h-11" value={v[k]} required
        onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))}
        aria-invalid={Boolean(error?.fields?.[k])}
        aria-describedby={error?.fields?.[k] ? `staff-${k}-err` : undefined}
        {...props}
      />
      {error?.fields?.[k] && <p id={`staff-${k}-err`} className="text-xs text-destructive">{error.fields[k]}</p>}
    </div>
  );
  return (
    <div className="space-y-4">
      <form
        aria-label="Criar acesso da equipe"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const r = await acceptUnitInviteWithSignup(token, v);
            if (r && !r.ok) setError(r);
          });
        }}
      >
        {field('full_name', 'Seu nome', { autoComplete: 'name', maxLength: 120 })}
        {field('email', 'E-mail', { type: 'email', autoComplete: 'username', maxLength: 254 })}
        {field('password', 'Crie uma senha', { type: 'password', autoComplete: 'new-password', minLength: 8 })}
        {field('confirm', 'Repita a senha', { type: 'password', autoComplete: 'new-password' })}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}{' '}
            {error.accountExists && <Link href={loginHref} className="font-medium underline">Entrar</Link>}
          </p>
        )}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Criar acesso e entrar</Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta na Rafanutri? <Link href={loginHref} className="font-medium text-foreground underline">Entre para aceitar</Link>
      </p>
    </div>
  );
}

/** Conta já logada: aceita com um toque. */
export function AcceptStaffInvite({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Você está conectado como <span className="font-medium text-foreground">{email}</span>.</p>
      <Button
        type="button" size="lg" className="h-11 w-full" disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await acceptUnitInviteLoggedIn(token);
            if (r.ok) router.push(`/app/uan/unidades/${r.unitId}`);
            else setError(r.message);
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" />} Aceitar convite
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
