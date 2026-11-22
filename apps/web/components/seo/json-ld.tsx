import { jsonLdString } from '@/lib/seo/json-ld';

/** Dados estruturados (schema.org) para o Google. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
