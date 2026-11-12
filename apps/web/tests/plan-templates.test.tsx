import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterTemplates, PlanTemplatesList } from '@/components/meal-plans/plan-templates-list';
import { PatientPlans } from '@/components/patients/patient-plans';
import { parseTags, roundPortion, scaleFactor, scaleMeals } from '@/lib/meal-plans/scale';
import type { MealPlanSummary, PlanMeal } from '@/lib/meal-plans/schema';
import type { MealPlanTemplate } from '@/lib/meal-plans/templates';

type R = { ok: true; id?: string } | { ok: false; message: string };
const applyTemplate = vi.fn<(p: string, t: string, k: number | null) => Promise<R>>(async () => ({ ok: true, id: 'novo' }));
const saveAsTemplate = vi.fn<(p: string, plan: string, i: unknown) => Promise<R>>(async () => ({ ok: true, id: 't' }));
vi.mock('@/lib/meal-plans/template-actions', () => ({
  applyTemplate: (p: string, t: string, k: number | null) => applyTemplate(p, t, k),
  saveAsTemplate: (p: string, plan: string, i: unknown) => saveAsTemplate(p, plan, i),
  updateTemplateInfo: vi.fn(async () => ({ ok: true })),
  deletePlanTemplate: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/meal-plans/actions', () => ({ createMealPlan: vi.fn(), deleteMealPlanDraft: vi.fn() }));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meals: PlanMeal[] = [
  { id: 'almoco', name: 'Almoço', time: '12:30', items: [
    { key: 'a', foodId: '3', quantityG: 150, subs: [{ foodId: '1', quantityG: 140 }] },
    { key: 'b', foodId: '260', quantityG: 8 },
    { key: 'c', foodId: '561', quantityG: 80 },
  ] },
];

describe('escala de modelo para a meta de calorias', () => {
  it('modelo de 2.000 kcal para meta de 1.600: reduz 20% e arredonda (critério do RN-035)', () => {
    const f = scaleFactor(2000, 1600)!;
    expect(f).toBeCloseTo(0.8);
    const scaled = scaleMeals(meals, f)[0]!.items;
    expect(scaled.map((i) => i.quantityG)).toEqual([120, 6, 65]); // 150→120; 8→6,4→6; 80→64→65
    expect(scaled[0]!.subs![0]!.quantityG).toBe(110); // 140→112→110
  });
  it('arredonda de 5 em 5 g a partir de 20 g e de 1 em 1 g abaixo, sem zerar', () => {
    expect([roundPortion(62), roundPortion(63), roundPortion(19.4), roundPortion(0.3), roundPortion(0)]).toEqual([60, 65, 19, 1, 0]);
  });
  it('sem energia no modelo ou meta inválida não escala; fator limitado a 0,3–3', () => {
    expect(scaleFactor(null, 1600)).toBeNull();
    expect(scaleFactor(2000, 0)).toBeNull();
    expect(scaleFactor(1000, 9000)).toBe(3);
    expect(scaleFactor(5000, 600)).toBe(0.3);
  });
  it('etiquetas: minúsculas, sem repetidas, até 10', () => {
    expect(parseTags(' Low carb, low carb , Emagrecimento,,')).toEqual(['low carb', 'emagrecimento']);
    expect(parseTags(Array.from({ length: 12 }, (_, i) => `t${i}`).join(','))).toHaveLength(10);
  });
});

const tpl = (over: Partial<MealPlanTemplate>): MealPlanTemplate => ({
  id: 't1', organization_id: 'o', name: 'Low carb', description: null, tags: ['low carb'], mode: 'quantitative', targets: {},
  meals, guidelines: null, energy_kcal: 2000, date_created: '2026-11-12T00:00:00Z', ...over,
});

describe('tela de modelos', () => {
  const list = [tpl({}), tpl({ id: 't2', name: 'Mediterrânea', tags: ['saúde cardiovascular'], organization_id: null })];
  it('busca sem acento e filtra por etiqueta', () => {
    expect(filterTemplates(list, 'mediterranea', null).map((t) => t.id)).toEqual(['t2']);
    expect(filterTemplates(list, '', 'low carb').map((t) => t.id)).toEqual(['t1']);
    expect(filterTemplates(list, 'cardio', null).map((t) => t.id)).toEqual(['t2']);
  });
  it('mostra kcal, refeições com nomes dos alimentos e esconde edição da biblioteca', () => {
    render(<PlanTemplatesList templates={list} foodNames={{ '3': 'Arroz, tipo 1, cozido' }} />);
    const lowCarb = screen.getByRole('heading', { name: 'Low carb' }).closest('li')!;
    expect(within(lowCarb).getByText(/2\.000 kcal\/dia/)).toBeTruthy();
    fireEvent.click(within(lowCarb).getByRole('button', { name: /Ver refeições/ }));
    expect(within(lowCarb).getByText('Arroz, tipo 1, cozido — 150 g')).toBeTruthy();
    const med = screen.getByRole('heading', { name: 'Mediterrânea' }).closest('li')!;
    expect(within(med).queryByRole('button', { name: /Editar/ })).toBeNull();
    expect(within(med).getByText('Biblioteca')).toBeTruthy();
  });
});

const plan: MealPlanSummary = { id: 'p1', title: 'Plano de novembro', status: 'published', mode: 'quantitative', published_at: '2026-11-10T00:00:00Z', valid_until: null, date_created: '2026-11-10T00:00:00Z', date_updated: null, totals: { energy_kcal: 1850 } };

describe('aba de planos: modelos', () => {
  const pid = '11111111-1111-4111-8111-111111111111';
  it('aplica modelo ajustando à meta e abre o rascunho', async () => {
    render(<PatientPlans patientId={pid} plans={[plan]} templates={[{ id: 't1', name: 'Low carb', energy_kcal: 2000, own: true }]} />);
    fireEvent.click(screen.getByLabelText('Ajustar à meta'));
    fireEvent.change(screen.getByLabelText('Meta (kcal/dia)'), { target: { value: '1600' } });
    expect(screen.getByText(/multiplicadas por 0,8/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Criar rascunho/ })));
    expect(applyTemplate).toHaveBeenCalledWith(pid, 't1', 1600);
    expect(push).toHaveBeenCalledWith(`/app/pacientes/${pid}/planos/novo`);
  });
  it('aplica sem escala quando a opção fica desmarcada', async () => {
    render(<PatientPlans patientId={pid} plans={[]} templates={[{ id: 't1', name: 'Low carb', energy_kcal: 2000, own: true }]} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Criar rascunho/ })));
    expect(applyTemplate).toHaveBeenCalledWith(pid, 't1', null);
  });
  it('salva um plano como modelo com nome e etiquetas', async () => {
    render(<PatientPlans patientId={pid} plans={[plan]} templates={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Salvar como modelo/ }));
    const form = screen.getByRole('form', { name: /Salvar Plano de novembro como modelo/ });
    fireEvent.change(within(form).getByLabelText(/Etiquetas/), { target: { value: 'hipertrofia' } });
    await act(async () => fireEvent.click(within(form).getByRole('button', { name: /Salvar modelo/ })));
    expect(saveAsTemplate).toHaveBeenCalledWith(pid, 'p1', { name: 'Plano de novembro', tags: 'hipertrofia' });
    expect(screen.getByRole('status').textContent).toMatch(/Modelo "Plano de novembro" salvo/);
  });
  it('sem modelos, não mostra a opção de aplicar', () => {
    render(<PatientPlans patientId={pid} plans={[]} templates={[]} />);
    expect(screen.queryByText('Novo a partir de modelo')).toBeNull();
  });
});
