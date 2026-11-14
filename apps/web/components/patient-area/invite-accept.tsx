'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptInviteLoggedIn, acceptInviteWithPassword } from '@/lib/patient-area/actions';

/** Primeiro acesso: cria a senha. */
export function CreatePasswordForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      aria-label="Criar acesso"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await acceptInviteWithPassword(token, password, confirm);
          if (r && !r.ok) setError({ message: r.message, field: r.field });
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="inv-email">E-mail de acesso</Label>
        <Input id="inv-email" value={email} readOnly autoComplete="username" className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inv-password">Crie uma senha</Label>
        <Input id="inv-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error?.field === 'password'} className="h-11" />
        <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inv-confirm">Repita a senha</Label>
        <Input id="inv-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={error?.field === 'confirm'} className="h-11" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Criar acesso e entrar</Button>
    </form>
  );
}

/** Já tem conta de paciente (de outro nutricionista): entra e aceita. */
export function AcceptLoggedIn({ token, loggedIn }: { token: string; loggedIn: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!loggedIn) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Você já tem acesso à área do paciente com este e-mail. Entre com a sua senha para juntar este nutricionista à sua conta.</p>
        <Button asChild size="lg" className="h-11 w-full"><Link href={`/login?next=${encodeURIComponent(`/p/convite/${token}`)}`}>Entrar para aceitar</Link></Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Button
        type="button" size="lg" className="h-11 w-full" disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await acceptInviteLoggedIn(token);
            if (r.ok) router.push('/p');
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
