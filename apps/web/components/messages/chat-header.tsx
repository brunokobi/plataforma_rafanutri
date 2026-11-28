import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { avatarInitials } from './avatar';

/** Topo da conversa: voltar, avatar, nome e linha de apoio, e ações à direita. */
export function ChatHeader({ back, title, subtitle, avatar, color, actions, backLabel = 'Voltar', backClassName, brand = false }: {
  back: string;
  title: string;
  subtitle?: ReactNode;
  avatar: { src: string } | { initials: string };
  color?: string | null;
  actions?: ReactNode;
  backLabel?: string;
  backClassName?: string;
  /** Mostra "via Rafanutri" (conversa do paciente). */
  brand?: boolean;
}) {
  return (
    <header className="z-20 flex min-h-16 shrink-0 items-center gap-2 border-b border-border/70 bg-background/95 px-1.5 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-3" style={color ? { borderTop: `3px solid ${color}` } : undefined}>
      <Link href={back} aria-label={backLabel} className={backClassName ?? 'grid size-11 shrink-0 place-items-center rounded-full text-foreground/80 hover:bg-muted'}>
        <ChevronLeft className="size-6" aria-hidden="true" />
      </Link>
      {'src' in avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- rota privada com o token da sessão
        <img src={avatar.src} alt="" className="size-10 shrink-0 rounded-full bg-white object-contain p-1 ring-1 ring-border" />
      ) : (
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground" style={color ? { backgroundColor: color, color: '#fff' } : undefined}>
          {avatarInitials(avatar.initials)}
        </span>
      )}
      <div className="min-w-0 flex-1 py-2">
        <h1 className="truncate text-[15px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        {brand && <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"><LogoMark className="size-3" />via Rafanutri</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1 pr-1">{actions}</div>}
    </header>
  );
}
