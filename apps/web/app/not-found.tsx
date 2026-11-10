import Link from 'next/link';
import { SimplePage } from '@/components/layout/simple-page';

export default function NotFound() {
  return (
    <SimplePage title="Página não encontrada">
      <p>O endereço que você abriu não existe ou foi movido.</p>
      <p>
        <Link href="/" className="font-medium text-primary hover:underline">Ir para a página inicial</Link>
      </p>
    </SimplePage>
  );
}
