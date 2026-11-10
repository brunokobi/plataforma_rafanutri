import type { Metadata } from 'next';
import { SimplePage } from '@/components/layout/simple-page';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default function RecoverPasswordPage() {
  return (
    <SimplePage title="Recuperar senha">
      <p>A recuperação de senha pelo próprio site chega em breve.</p>
      <p>Por enquanto, fale com o suporte da Rafanutri para redefinir seu acesso.</p>
    </SimplePage>
  );
}
