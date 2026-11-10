import { z } from 'zod';

/** Mesmo schema no formulário (cliente) e na Server Action (servidor). */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe seu e-mail.').email('Digite um e-mail válido.').max(254),
  password: z.string().min(1, 'Informe sua senha.').max(256),
  next: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
