'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT, ADSENSE_SLOT, isAdZone } from '@/lib/ads/config';

declare global {
  interface Window { adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number; pauseAdRequests?: number } }
}

/**
 * Anúncio do plano Gratuito. Carrega o AdSense só nas telas sem dados de paciente, com anúncios não
 * personalizados. Fora delas não renderiza nada (e a CSP da página também bloqueia o script).
 */
export function AdSlot({ className }: { className?: string }) {
  const pathname = usePathname();
  const pushed = useRef(false);
  const zone = isAdZone(pathname);

  useEffect(() => {
    if (!zone || !ADSENSE_SLOT || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || ([] as unknown as NonNullable<Window['adsbygoogle']>)).push({});
    } catch {
      /* bloqueador de anúncios: segue sem anúncio */
    }
  }, [zone]);

  if (!zone) return null;
  return (
    <>
      <Script id="adsense-npa" strategy="afterInteractive">
        {'(window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1;'}
      </Script>
      <Script id="adsense" strategy="afterInteractive" crossOrigin="anonymous" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`} />
      {ADSENSE_SLOT && (
        <aside aria-label="Publicidade" className={className}>
          <p className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">Publicidade · some nos planos pagos</p>
          <ins className="adsbygoogle block min-h-[90px]" data-ad-client={ADSENSE_CLIENT} data-ad-slot={ADSENSE_SLOT} data-ad-format="auto" data-full-width-responsive="true" />
        </aside>
      )}
    </>
  );
}
