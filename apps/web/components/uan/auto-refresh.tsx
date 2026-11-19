'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Recarrega os dados da página a cada `seconds` (modo TV). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
