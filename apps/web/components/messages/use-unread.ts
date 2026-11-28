'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Contagem de mensagens não lidas: ao abrir, ao trocar de tela, ao voltar para a aba e a cada 30 s com a tela visível. */
export function useUnreadCount(fetchCount: () => Promise<number>, everyMs = 30000): number {
  const [count, setCount] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      fetchCount().then((n) => { if (alive) setCount(n); }).catch(() => undefined);
    };
    run();
    const t = setInterval(run, everyMs);
    document.addEventListener('visibilitychange', run);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', run);
    };
  }, [fetchCount, everyMs, pathname]);
  return count;
}
