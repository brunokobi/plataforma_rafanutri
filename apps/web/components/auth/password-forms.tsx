'use client';

import { CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset, resetPassword, type Result } from '@/lib/auth/password-actions';

export function RequestResetForm() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  if (result?.ok) {
    return (
      <div role="status" className="space-y-3">
        <MailCheck className="size-8 text-primary" aria-hidden="true" />
        <p className="font-medium text-foreground">Se houver uma conta com este e-mail, o link para criar uma senha nova chega em alguns minutos.</p>
        <p className="text-sm">Confira também a caixa de spam. O link vale por pouco tempo.</p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">Voltar para o login</Link>
      </div>
    );
  }
  return (
    <form aria-label="Recuperar senha" className="space-y-4" onSubmit={(e) => { e.preventDefault(); startTransition(async () => setResult(await requestPasswordReset(email))); }}>
      <p>Informe o e-mail da sua conta. Enviaremos um link para você criar uma senha nova.</p>
      <div className="space-y-1.5">
        <Label htmlFor="rs-email">E-mail</Label>
        <Input id="rs-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={result?.ok === false && result.field === 'email'} className="h-11" />
      </div>
      {result && !result.ok && <p role="alert" className="text-sm text-destructive">{result.message}</p>}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Enviar link</Button>
      <p className="text-sm"><Link href="/login" className="font-medium text-primary hover:underline">Lembrou a senha? Entrar</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  if (!token) return <p role="alert">Link inválido. <Link href="/recuperar-senha" className="font-medium text-primary hover:underline">Peça um novo</Link>.</p>;
  if (result?.ok) {
    return (
      <div role="status" className="space-y-3">
        <CheckCircle2 className="size-8 text-primary" aria-hidden="true" />
        <p className="font-medium text-foreground">Senha trocada. Já pode entrar com a senha nova.</p>
        <Button asChild size="lg" className="h-11"><Link href="/login">Entrar</Link></Button>
      </div>
    );
  }
  return (
    <form aria-label="Criar senha nova" className="space-y-4" onSubmit={(e) => { e.preventDefault(); startTransition(async () => setResult(await resetPassword(token, password, confirm))); }}>
      <div className="space-y-1.5">
        <Label htmlFor="np-password">Senha nova</Label>
        <Input id="np-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={result?.ok === false && result.field === 'password'} className="h-11" />
        <p className="text-xs">Pelo menos 8 caracteres.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="np-confirm">Repita a senha</Label>
        <Input id="np-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={result?.ok === false && result.field === 'confirm'} className="h-11" />
      </div>
      {result && !result.ok && (
        <p role="alert" className="text-sm text-destructive">{result.message}{result.message.includes('Peça um novo') && <> <Link href="/recuperar-senha" className="font-medium underline">Pedir novo link</Link></>}</p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar senha nova</Button>
    </form>
  );
}
