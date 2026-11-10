// Paciente fictícia para as telas de demonstração (pré-lançamento, nada é salvo).
import type { Skinfolds } from '@rafanutri/nutrition-core';

export const demoPatient = {
  id: 'exemplo',
  name: 'Marina Costa',
  sex: 'female' as const,
  ageYears: 32,
  heightCm: 165,
  objective: 'Emagrecimento com preservação de massa magra',
  restrictions: ['Intolerância à lactose'],
};

export interface DemoAssessment {
  date: string; // ISO
  weightKg: number;
  waistCm: number;
  hipCm: number;
  skinfolds: Skinfolds;
}

/** Histórico ilustrativo (3 avaliações anteriores). */
export const demoHistory: DemoAssessment[] = [
  { date: '2026-08-12', weightKg: 72.4, waistCm: 84, hipCm: 104, skinfolds: { triceps: 24, suprailiac: 22, thigh: 32 } },
  { date: '2026-09-15', weightKg: 70.8, waistCm: 82, hipCm: 103, skinfolds: { triceps: 22, suprailiac: 20, thigh: 30 } },
  { date: '2026-10-20', weightKg: 69.1, waistCm: 80, hipCm: 102, skinfolds: { triceps: 21, suprailiac: 18, thigh: 28 } },
];
