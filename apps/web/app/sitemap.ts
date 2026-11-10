import type { MetadataRoute } from 'next';

const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://rafanutri.brunokobi.tech';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/cadastro', '/termos', '/privacidade'].map((path) => ({
    url: `${site}${path}`,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.5,
  }));
}
