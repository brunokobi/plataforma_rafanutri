import type { Metadata } from 'next';
import Link from 'next/link';
import { SimplePage } from '@/components/layout/simple-page';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Criar conta grátis' };

export default function SignupPage() {
  return (
    <SimplePage title="Crie sua conta grátis">
      <p>O cadastro abre em breve. O plano gratuito permite até 20 pacientes ativos, sem cartão e sem prazo.</p>
      <p>Enquanto isso, se você já recebeu um acesso, entre pela tela de login.</p>
      <Button asChild className="mt-2">
        <Link href="/login">Ir para o login</Link>
      </Button>
    </SimplePage>
  );
}
