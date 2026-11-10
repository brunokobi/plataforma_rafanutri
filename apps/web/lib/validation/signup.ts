import { z } from 'zod';

export const passwordRules = [
  { id: 'length', label: 'Pelo menos 8 caracteres', test: (v: string) => v.length >= 8 },
  { id: 'letter', label: 'Uma letra', test: (v: string) => /[A-Za-zÀ-ÿ]/.test(v) },
  { id: 'number', label: 'Um número', test: (v: string) => /\d/.test(v) },
] as const;

/** Força de 0 a 4: regras obrigatórias + bônus por tamanho e símbolos. */
export function passwordStrength(value: string): number {
  if (!value) return 0;
  let score = passwordRules.filter((r) => r.test(value)).length; // até 3
  if (value.length >= 12 && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(score, 4);
}

export const signupSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(3, 'Informe seu nome completo.')
      .max(120, 'Nome muito longo.')
      .refine((v) => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome.'),
    email: z.string().trim().min(1, 'Informe seu e-mail.').email('Digite um e-mail válido.').max(254),
    password: z
      .string()
      .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
      .max(128, 'Senha muito longa.')
      .refine((v) => /[A-Za-zÀ-ÿ]/.test(v) && /\d/.test(v), 'Use letras e números na senha.'),
    confirm_password: z.string().min(1, 'Confirme a senha.'),
    accept_terms: z.boolean().refine((v) => v, 'É preciso aceitar os termos para continuar.'),
  })
  .refine((d) => d.password === d.confirm_password, { path: ['confirm_password'], message: 'As senhas não conferem.' });

export type SignupInput = z.infer<typeof signupSchema>;
