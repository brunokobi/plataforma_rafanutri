import { z } from 'zod';

export const CRN_REGIONS = Array.from({ length: 11 }, (_, i) => `CRN-${i + 1}`) as [string, ...string[]];

export const BRAND_COLORS = ['#2E7D32', '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#EA580C', '#B45309', '#374151'];

export const SERVICE_MODES = [
  { value: 'in_person', label: 'Presencial' },
  { value: 'online', label: 'Online' },
] as const;

export const PRACTICE_AREAS = [
  'Emagrecimento', 'Nutrição esportiva', 'Hipertrofia', 'Diabetes', 'Hipertensão', 'Saúde intestinal',
  'Vegetarianos e veganos', 'Saúde da mulher', 'Gestantes', 'Pediatria', 'Idosos', 'Nutrição comportamental',
  'Oncologia', 'Intolerâncias alimentares',
];

export const profileStep = z.object({
  professional_name: z.string().trim().min(3, 'Informe o nome que aparece para os pacientes.').max(120),
  crn: z.string().trim().regex(/^\d{1,6}$/, 'Informe só os números do CRN (até 6 dígitos).'),
  crn_region: z.enum(CRN_REGIONS, { error: 'Escolha a regional do seu CRN.' }),
});

export const practiceStep = z.object({
  practice_name: z.string().trim().min(2, 'Informe o nome do consultório.').max(120),
  practice_type: z.enum(['solo', 'clinic'], { error: 'Escolha uma opção.' }),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.'),
});

export const serviceStep = z.object({
  service_modes: z.array(z.enum(['in_person', 'online'])).min(1, 'Escolha ao menos uma modalidade.'),
  areas: z.array(z.string()).max(PRACTICE_AREAS.length),
});

export const onboardingSchema = profileStep.extend(practiceStep.shape).extend(serviceStep.shape);
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const STEP_FIELDS: Array<Array<keyof OnboardingInput>> = [
  Object.keys(profileStep.shape) as Array<keyof OnboardingInput>,
  Object.keys(practiceStep.shape) as Array<keyof OnboardingInput>,
  Object.keys(serviceStep.shape) as Array<keyof OnboardingInput>,
  [],
];

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function validateLogo(file: { type: string; size: number }): string | null {
  if (!LOGO_TYPES.includes(file.type)) return 'Use uma imagem PNG, JPG ou SVG.';
  if (file.size > LOGO_MAX_BYTES) return 'A imagem precisa ter até 2 MB.';
  return null;
}
