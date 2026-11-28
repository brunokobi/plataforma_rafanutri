import { describe, expect, it } from 'vitest';
import { SOLUTIONS } from '@/lib/marketing/solutions';
import { breadcrumbLd, faqLd, jsonLdString, softwareLd } from '@/lib/seo/json-ld';
import { absoluteUrl, pageMetadata } from '@/lib/seo/site';

describe('SEO', () => {
  it('JSON-LD não deixa fechar a tag script', () => {
    expect(jsonLdString({ a: '</script><script>alert(1)</script>' })).not.toContain('</script>');
  });

  it('ofertas dos planos com preço em reais e sem oferta quando não há plano', () => {
    const offers = softwareLd().offers as Array<{ price: string; priceCurrency: string }>;
    expect(offers.map((o) => o.price)).toEqual(['0.00', '49.90', '99.90', '199.90']);
    expect(offers.every((o) => o.priceCurrency === 'BRL')).toBe(true);
    expect(softwareLd([])).not.toHaveProperty('offers');
  });

  it('créditos: criadora e desenvolvedor no JSON-LD', () => {
    const sw = softwareLd();
    expect(sw.creator).toMatchObject({ '@type': 'Person', name: 'Rafaela Soares Souza Kobi', jobTitle: 'Nutricionista' });
    expect(sw.author).toMatchObject({ '@type': 'Person', name: 'Bruno Kobi' });
  });

  it('FAQ e trilha no formato do schema.org', () => {
    expect(faqLd([{ q: 'P?', a: 'R.' }]).mainEntity).toEqual([{ '@type': 'Question', name: 'P?', acceptedAnswer: { '@type': 'Answer', text: 'R.' } }]);
    const b = breadcrumbLd([{ name: 'Início', path: '/' }, { name: 'Soluções', path: '/solucoes' }]).itemListElement as Array<{ position: number; item: string }>;
    expect(b[1]).toMatchObject({ position: 2, item: absoluteUrl('/solucoes') });
  });

  it('canonical e Open Graph com a mesma URL', () => {
    const m = pageMetadata({ title: 'T', description: 'D', path: '/solucoes/uan' });
    expect(m.alternates?.canonical).toBe(absoluteUrl('/solucoes/uan'));
    expect((m.openGraph as { url?: string }).url).toBe(absoluteUrl('/solucoes/uan'));
  });

  it('páginas de solução: slugs únicos, títulos e descrições no tamanho que o Google mostra', () => {
    expect(new Set(SOLUTIONS.map((s) => s.slug)).size).toBe(SOLUTIONS.length);
    for (const s of SOLUTIONS) {
      expect(s.slug).toMatch(/^[a-z0-9-]+$/);
      expect(s.title.length, s.slug).toBeLessThanOrEqual(70);
      expect(s.description.length, s.slug).toBeGreaterThanOrEqual(70);
      expect(s.description.length, s.slug).toBeLessThanOrEqual(160);
      expect(s.features.length).toBeGreaterThanOrEqual(3);
      expect(s.faq.length).toBeGreaterThanOrEqual(1);
    }
  });
});
