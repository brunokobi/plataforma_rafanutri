import 'server-only';
import { z } from 'zod';

const schema = z.object({
  DIRECTUS_URL: z.string().url(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
});

/** Variáveis de servidor, validadas na primeira leitura. */
export const env = schema.parse({
  DIRECTUS_URL: process.env.DIRECTUS_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
