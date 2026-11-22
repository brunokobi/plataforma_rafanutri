import type { Metadata } from 'next';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://rafanutri.brunokobi.tech').replace(/\/$/, '');
export const SITE_NAME = 'Rafanutri';

/** URL absoluta de um caminho do site ("" ou "/" = início). */
export const absoluteUrl = (path = '') => `${SITE_URL}${path === '/' ? '' : path}`;

/**
 * Metadados de uma página pública: título, descrição, endereço oficial (canonical) e Open Graph com a mesma URL.
 * `absoluteTitle` ignora o modelo "%s · Rafanutri" (página inicial).
 */
export function pageMetadata({ title, description, path, absoluteTitle = false, keywords }: { title: string; description: string; path: string; absoluteTitle?: boolean; keywords?: string[] }): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords,
    alternates: { canonical: absoluteUrl(path) || SITE_URL },
    openGraph: { type: 'website', locale: 'pt_BR', siteName: SITE_NAME, url: absoluteUrl(path) || SITE_URL, title, description },
    twitter: { card: 'summary_large_image', title, description },
  };
}
