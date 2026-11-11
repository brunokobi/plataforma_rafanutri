import { z } from 'zod';

export type PatientStatus = 'active' | 'inactive' | 'archived';

export interface Patient {
  id: string;
  full_name: string;
  birth_date: string | null; // AAAA-MM-DD
  sex: 'female' | 'male' | null;
  email: string | null;
  phone: string | null; // E.164
  objective: string | null;
  status: PatientStatus;
  created_at: string;
}

const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** CPF com dígitos verificadores corretos (aceita com ou sem pontuação). */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/**
 * Telefone brasileiro para E.164. Aceita "(31) 99999-8888", "31999998888", "+55 31 ...".
 * Devolve null se não der para interpretar como celular ou fixo com DDD.
 */
export function phoneToE164(value: string): string | null {
  let d = onlyDigits(value);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (d[0] === '0' || d[1] === '0') return null; // DDD inválido
  return `+55${d}`;
}

/** Idade em anos completos numa data de referência. */
export function ageInYears(birthDate: string, today = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const optional = (s: unknown) => (typeof s === 'string' && s.trim() === '' ? undefined : s);

export const patientFormSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(3, 'Informe o nome completo.')
    .max(120, 'Use no máximo 120 caracteres.')
    .refine((v) => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome.'),
  birth_date: z.preprocess(
    optional,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
      .refine((v) => v >= '1900-01-01' && v <= todayISO(), 'A data de nascimento não pode ser no futuro.')
      .optional(),
  ),
  sex: z.preprocess(optional, z.enum(['female', 'male'], { error: 'Escolha uma opção.' }).optional()),
  email: z.preprocess(optional, z.email('Digite um e-mail válido.').optional()),
  phone: z.preprocess(
    optional,
    z
      .string()
      .refine((v) => phoneToE164(v) !== null, 'Telefone com DDD, ex.: (31) 99999-8888.')
      .transform((v) => phoneToE164(v)!)
      .optional(),
  ),
  cpf: z.preprocess(
    optional,
    z
      .string()
      .refine(isValidCpf, 'CPF inválido.')
      .transform(onlyDigits)
      .optional(),
  ),
  objective: z.preprocess(optional, z.string().trim().max(300, 'Use no máximo 300 caracteres.').optional()),
});

export type PatientFormInput = z.input<typeof patientFormSchema>;
export type PatientFormData = z.output<typeof patientFormSchema>;
