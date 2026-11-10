import { Menu } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

const links = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#paciente', label: 'Para o paciente' },
  { href: '#planos', label: 'Planos' },
  { href: '#perguntas', label: 'Perguntas frequentes' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Logo />
        <nav aria-label="Principal" className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/cadastro">Começar grátis</Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Menu" className="flex flex-col gap-1 px-4">
                {links.map((l) => (
                  <a key={l.href} href={l.href} className="rounded-md px-2 py-2.5 text-base hover:bg-muted">
                    {l.label}
                  </a>
                ))}
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/login">Entrar</Link>
                </Button>
                <Button asChild className="mt-2">
                  <Link href="/cadastro">Começar grátis</Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
