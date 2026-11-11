import { z } from 'zod';
import type { AssessmentResults, Protocol } from './compute';

export interface Assessment {
  id: string;
  patient_id: string;
  assessed_at: string;
  weight_kg: number | null;
  height_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  protocol: Protocol | null;
  density_equation: 'siri' | 'brozek' | null;
  skinfolds: Record<string, number>;
  results: AssessmentResults;
  notes: string | null;
  date_created: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const measure = (min: number, max: number, label: string) =>
  z.number().min(min, `${label} fora da faixa.`).max(max, `${label} fora da faixa.`).nullable();

/** Validação do que o navegador envia (o servidor recalcula os resultados). */
export const assessmentInputSchema = z.object({
  assessed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
    .refine((v) => v >= '1900-01-01' && v <= todayISO(), 'A data da avaliação não pode ser no futuro.'),
  weight_kg: measure(1, 400, 'Peso'),
  height_cm: measure(30, 250, 'Altura'),
  waist_cm: measure(30, 250, 'Cintura'),
  hip_cm: measure(30, 250, 'Quadril'),
  protocol: z.enum(['jp3', 'jp7', 'durnin_womersley', 'faulkner', 'isak']).nullable(),
  density_equation: z.enum(['siri', 'brozek']),
  skinfolds: z.record(z.string(), z.number().min(1, 'Dobra fora da faixa.').max(80, 'Dobra fora da faixa.')),
  notes: z.string().trim().max(1000).nullable().optional(),
}).refine((d) => d.weight_kg !== null || d.waist_cm !== null || Object.keys(d.skinfolds).length > 0, {
  message: 'Informe ao menos uma medida.',
});

export type AssessmentInputData = z.infer<typeof assessmentInputSchema>;
