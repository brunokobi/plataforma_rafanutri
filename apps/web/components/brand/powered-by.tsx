import { LogoMark } from './logo';
import { cn } from '@/lib/utils';

/**
 * Assinatura do sistema nas telas que o paciente ou o público veem (área do paciente, anamnese,
 * convite, página do consultório, cardápio): a marca do consultório fica no topo e este selo
 * no rodapé mostra que a página é feita com a Rafanutri.
 */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <footer className={cn('mt-8 flex flex-col items-center gap-2 border-t border-border/60 py-6 text-center', className)}>
      <a href="/" target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-sm transition-colors hover:border-primary/40">
        <LogoMark className="size-6" />
        <span className="text-muted-foreground">Feito com</span>
        <span className="font-display text-base font-semibold text-foreground">Rafanutri</span>
      </a>
      <p className="max-w-xs text-xs text-muted-foreground">Plataforma de acompanhamento nutricional. Seus dados de saúde ficam protegidos.</p>
    </footer>
  );
}
