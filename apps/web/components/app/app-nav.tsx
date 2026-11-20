'use client';

import { ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type NavLink = { href: string; label: string };
type NavGroup = { title: string; links: NavLink[] };
type NavModel = { primary: NavLink[]; more: NavGroup[] };

/** Links do cabeçalho conforme a área: a UAN tem os seus; o resto é o consultório. */
export function navModel(pathname: string, homeHref = '/app', patientsHref = '/app/pacientes'): NavModel {
  if (pathname.startsWith('/app/uan')) {
    return {
      primary: [
        { href: homeHref, label: 'Módulos' },
        { href: '/app/uan', label: 'Unidades' },
        { href: '/app/uan/fichas', label: 'Fichas técnicas' },
        { href: '/app/uan/conformidade', label: 'Conformidade' },
        { href: '/app/uan/rede', label: 'Rede' },
      ],
      more: [
        { title: 'Cadastros', links: [{ href: '/app/uan/insumos', label: 'Insumos' }, { href: '/app/uan/fornecedores', label: 'Fornecedores' }, { href: '/app/uan/perfis', label: 'Perfis e regras' }, { href: '/app/uan/importar', label: 'Importar planilhas' }] },
        { title: 'Conta', links: [{ href: '/app/configuracoes/consultorio', label: 'Consultório' }, { href: '/app/configuracoes/plano', label: 'Meu plano' }] },
      ],
    };
  }
  return {
    primary: [
      { href: homeHref, label: 'Módulos' },
      { href: '/app/clinico', label: 'Painel' },
      { href: patientsHref, label: 'Pacientes' },
      { href: '/app/agenda', label: 'Agenda' },
      { href: '/app/crm', label: 'CRM' },
      { href: '/app/financeiro', label: 'Financeiro' },
    ],
    more: [
      {
        title: 'Conteúdo',
        links: [
          { href: '/app/questionarios', label: 'Questionários' },
          { href: '/app/modelos-de-plano', label: 'Modelos de plano' },
          { href: '/app/alimentos', label: 'Alimentos' },
          { href: '/app/receitas', label: 'Receitas' },
          { href: '/app/orientacoes', label: 'Orientações' },
        ],
      },
      { title: 'Conta', links: [{ href: '/app/configuracoes/consultorio', label: 'Consultório' }, { href: '/app/configuracoes/plano', label: 'Meu plano' }] },
    ],
  };
}

/** Link ativo: o mais específico que casa com a rota (Módulos só na própria página). */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  const hits = hrefs.filter((h) => pathname === h || (h !== '/app' && pathname.startsWith(`${h}/`)));
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Navegação da área logada: atalhos principais + "Mais" no computador; menu lateral no celular e tablet. */
export function AppNav({ homeHref = '/app', patientsHref = '/app/pacientes' }: { homeHref?: string; patientsHref?: string }) {
  const pathname = usePathname() ?? '';
  const model = navModel(pathname, homeHref, patientsHref);
  const all = [...model.primary, ...model.more.flatMap((g) => g.links)];
  const active = activeHref(pathname, all.map((l) => l.href));
  const moreActive = model.more.some((g) => g.links.some((l) => l.href === active));
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // fecha o "Mais" ao clicar fora ou com Esc
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [moreOpen]);

  const linkClass = (href: string) =>
    cn('rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted hover:text-foreground', href === active && 'bg-muted text-foreground');

  return (
    <>
      <nav aria-label="Área logada" className="hidden items-center gap-1 text-sm font-medium text-muted-foreground lg:flex">
        {model.primary.map((l) => (
          <Link key={l.href} href={l.href} aria-current={l.href === active ? 'page' : undefined} className={linkClass(l.href)}>{l.label}</Link>
        ))}
        <div ref={moreRef} className="relative">
          <button type="button" aria-expanded={moreOpen} aria-haspopup="true" onClick={() => setMoreOpen((v) => !v)}
            className={cn('flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted hover:text-foreground', (moreOpen || moreActive) && 'bg-muted text-foreground')}>
            Mais <ChevronDown className={cn('size-4 transition-transform', moreOpen && 'rotate-180')} aria-hidden="true" />
          </button>
          {moreOpen && (
            <div className="absolute left-0 top-full z-40 mt-2 w-56 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
              {model.more.map((g) => (
                <div key={g.title} className="py-1">
                  <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
                  {g.links.map((l) => (
                    <Link key={l.href} href={l.href} onClick={() => setMoreOpen(false)} aria-current={l.href === active ? 'page' : undefined}
                      className={cn('block rounded-md px-2 py-1.5 text-sm hover:bg-muted', l.href === active && 'bg-muted font-semibold')}>{l.label}</Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu"><Menu className="size-5" /></Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72">
          <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
          <nav aria-label="Menu" className="space-y-4 overflow-y-auto px-4 pb-6 text-sm">
            {[{ title: 'Principal', links: model.primary }, ...model.more].map((g) => (
              <div key={g.title}>
                <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
                {g.links.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setSheetOpen(false)} aria-current={l.href === active ? 'page' : undefined}
                    className={cn('block rounded-md px-2 py-2 hover:bg-muted', l.href === active && 'bg-muted font-semibold')}>{l.label}</Link>
                ))}
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
