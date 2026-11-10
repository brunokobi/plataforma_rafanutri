// Pacientes fictícios para a demonstração da lista (só "exemplo" tem ficha completa).
export type PatientStatus = 'active' | 'inactive' | 'archived';

export interface DemoPatientRow {
  id: string;
  name: string;
  ageYears: number;
  objective: string;
  status: PatientStatus;
  lastVisit: string | null; // ISO
  nextVisit: string | null; // ISO
  tags: string[];
}

export const DEMO_PATIENTS: DemoPatientRow[] = [
  { id: 'exemplo', name: 'Marina Costa', ageYears: 32, objective: 'Emagrecimento', status: 'active', lastVisit: '2026-10-20', nextVisit: '2026-11-18', tags: ['Sem lactose'] },
  { id: 'p2', name: 'Rafael Lima', ageYears: 27, objective: 'Hipertrofia', status: 'active', lastVisit: '2026-11-03', nextVisit: '2026-12-01', tags: ['Esportiva'] },
  { id: 'p3', name: 'Beatriz Nogueira', ageYears: 45, objective: 'Controle glicêmico', status: 'active', lastVisit: '2026-10-28', nextVisit: '2026-11-25', tags: ['Diabetes tipo 2'] },
  { id: 'p4', name: 'Carlos Menezes', ageYears: 58, objective: 'Saúde cardiovascular', status: 'active', lastVisit: '2026-09-30', nextVisit: null, tags: ['Hipertensão'] },
  { id: 'p5', name: 'Juliana Prado', ageYears: 34, objective: 'Gestação (2º trimestre)', status: 'active', lastVisit: '2026-11-05', nextVisit: '2026-11-19', tags: ['Gestante'] },
  { id: 'p6', name: 'Lucas Andrade', ageYears: 22, objective: 'Desempenho esportivo', status: 'active', lastVisit: '2026-10-15', nextVisit: '2026-11-12', tags: ['Corrida'] },
  { id: 'p7', name: 'Helena Duarte', ageYears: 67, objective: 'Manutenção de massa muscular', status: 'active', lastVisit: '2026-08-21', nextVisit: null, tags: ['Idosa'] },
  { id: 'p8', name: 'Pedro Siqueira', ageYears: 41, objective: 'Reeducação alimentar', status: 'inactive', lastVisit: '2026-05-10', nextVisit: null, tags: [] },
  { id: 'p9', name: 'Fernanda Alves', ageYears: 29, objective: 'Saúde intestinal', status: 'archived', lastVisit: '2026-02-14', nextVisit: null, tags: ['FODMAP'] },
];
