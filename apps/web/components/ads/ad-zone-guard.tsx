'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isAdZone } from '@/lib/ads/config';

/**
 * Quem vê anúncio: a troca entre telas com anúncio e telas com dados de paciente vira um carregamento
 * completo da página. Assim o script do AdSense nunca continua rodando numa tela de paciente, e cada
 * tela recebe a sua CSP (a das telas de paciente bloqueia o Google).
 */
export function AdZoneGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const here = isAdZone(window.location.pathname);
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (isAdZone(url.pathname) !== here) {
        e.preventDefault();
        e.stopPropagation();
        window.location.assign(url.href);
      }
    };
    const onPop = () => {
      if (isAdZone(window.location.pathname) !== here) window.location.reload();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
    };
  }, [pathname]);

  // Navegação feita pelo código (router.push) que cruzou a fronteira: recarrega.
  useEffect(() => {
    const loaded = document.querySelector('script#adsense, script[src*="googlesyndication"]');
    if (loaded && !isAdZone(pathname)) window.location.reload();
  }, [pathname]);

  return null;
}
