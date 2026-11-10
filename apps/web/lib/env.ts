import { z } from 'zod';

const schema = z.object({
  DIRECTUS_URL: z.url().default('https://rafanutri-api.brunokobi.tech'),
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
});

/** Variáveis de ambiente do servidor, validadas na primeira leitura. */
export const env = schema.parse({
  DIRECTUS_URL: process.env.DIRECTUS_URL || undefined,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
});
