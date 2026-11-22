import type { MetadataRoute } from 'next';

const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://rafanutri.brunokobi.tech';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app', '/api', '/login', '/p$', '/p/', '/onboarding', '/r/', '/avisos', '/uan/convite', '/cadastro/verificar'] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
