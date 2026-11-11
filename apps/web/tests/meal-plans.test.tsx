import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@/lib/foods/food';
import { DEFAULT_MEALS, DEFAULT_TARGETS, planContentSchema, planFoodIds, type MealPlanSummary, type PlanContent } from '@/lib/meal-plans/schema';

const createMealPlan = vi.fn();
const deleteMealPlanDraft = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
vi.mock('@/lib/meal-plans/actions', () => ({
  createMealPlan: (...a: unknown[]) => createMealPlan(...a),
  deleteMealPlanDraft: (...a: unknown[]) => deleteMealPlanDraft(...a),
  saveMealPlan: vi.fn(),
  publishMealPlan: vi.fn(),
}));
vi.mock('@/lib/foods/actions', () => ({ searchFoods: vi.fn(), foodsInGroup: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const { PatientPlans } = await import('@/components/patients/patient-plans');
const { MealPlanEditor } = await import('@/components/clinical/meal-plan-editor');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  [createMealPlan, deleteMealPlanDraft, push, refresh].forEach((m) => m.mockReset());
});

const PID = '3f6c1e2a-9b7d-4c1e-8a2b-1c2d3e4f5a6b';
const content: PlanContent = {
  title: 'Plano de novembro',
  mode: 'quantitative',
  targets: DEFAULT_TARGETS,
  meals: [{ id: 'almoco', name: 'Almoço', time: '12:30', items: [{ key: 'a1', foodId: '3', quantityG: 150, subs: [{ foodId: '600', quantityG: 120 }] }] }],
  guidelines: 'Beber 2 L de água por dia.',
};

describe('planContentSchema', () => {
  it('aceita um plano válido e lista os alimentos usados', () => {
    expect(planContentSchema.safeParse(content).success).toBe(true);
    expect(planFoodIds(content.meals)).toEqual(['3', '600']);
  });
  it('recusa título vazio, id de alimento inválido e horário fora do formato', () => {
    expect(planContentSchema.safeParse({ ...content, title: '  ' }).error?.issues[0]?.message).toBe('Dê um título ao plano.');
    const badFood = { ...content, meals: [{ ...content.meals[0], items: [{ key: 'x', foodId: 'abc', quantityG: 10 }] }] };
    expect(planContentSchema.safeParse(badFood).success).toBe(false);
    expect(planContentSchema.safeParse({ ...content, meals: [{ ...content.meals[0], time: '7h' }] }).success).toBe(false);
  });
  it('as refeições padrão começam vazias', () => expect(planFoodIds(DEFAULT_MEALS)).toEqual([]));
});

const plans: MealPlanSummary[] = [
  { id: 'p2', title: 'Plano de dezembro', status: 'draft', mode: 'quantitative', published_at: null, valid_until: null, date_created: '2026-11-11T10:00:00Z', date_updated: null, totals: null },
  { id: 'p1', title: 'Plano de novembro', status: 'published', mode: 'quantitative', published_at: '2026-11-01T10:00:00Z', valid_until: '2026-12-01', date_created: '2026-10-30T10:00:00Z', date_updated: null, totals: { energy_kcal: 1812.4 } },
];

describe('PatientPlans', () => {
  it('mostra status, validade e calorias do publicado', () => {
    render(<PatientPlans patientId={PID} plans={plans} />);
    expect(screen.getByText('Rascunho')).toBeTruthy();
    expect(screen.getByText('Publicado')).toBeTruthy();
    expect(screen.getByText(/1\.812 kcal\/dia/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Plano de novembro' }).getAttribute('href')).toBe(`/app/pacientes/${PID}/planos/p1`);
  });
  it('cria um plano e abre o editor', async () => {
    createMealPlan.mockResolvedValue({ ok: true, id: 'novo' });
    render(<PatientPlans patientId={PID} plans={[]} />);
    expect(screen.getByText('Nenhum plano criado ainda.')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Novo plano/ })));
    expect(createMealPlan).toHaveBeenCalledWith(PID, undefined);
    expect(push).toHaveBeenCalledWith(`/app/pacientes/${PID}/planos/novo`);
  });
  it('nova versão copia o publicado; apagar rascunho pede confirmação', async () => {
    createMealPlan.mockResolvedValue({ ok: false, message: 'Sem permissão.' });
    deleteMealPlanDraft.mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PatientPlans patientId={PID} plans={plans} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Nova versão/ })));
    expect(createMealPlan).toHaveBeenCalledWith(PID, 'p1');
    expect(screen.getByRole('alert').textContent).toBe('Sem permissão.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Apagar rascunho Plano de dezembro' })));
    expect(deleteMealPlanDraft).toHaveBeenCalledWith(PID, 'p2');
    expect(refresh).toHaveBeenCalled();
  });
  it('coleção não liberada mostra o aviso de ativação', () => {
    render(<PatientPlans patientId={PID} plans="unavailable" />);
    expect(screen.getByText('Planos por paciente em ativação')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Novo plano/ })).toBeNull();
  });
});

const ARROZ: Food = {
  id: '3', name: 'Arroz, tipo 1, cozido', group: 'Cereais e derivados', source: 'TACO', householdMeasures: [],
  per100g: { energy_kcal: 128, protein_g: 2.5, carbohydrate_g: 28, lipid_g: 0.2, fiber_g: 1.6 },
};
const MACARRAO: Food = { ...ARROZ, id: '600', name: 'Macarrão, trigo, cozido' };
const editorProps = {
  initialPlan: content.meals,
  initialFoods: [ARROZ, MACARRAO],
  initialTitle: content.title,
  initialMode: content.mode,
  initialTargets: content.targets,
  initialGuidelines: content.guidelines,
  patient: { name: 'Beatriz Nogueira', objective: null, sex: 'female' as const, ageYears: 45, weightKg: 70, heightCm: 165 },
};

describe('MealPlanEditor do paciente', () => {
  it('salva o rascunho com o conteúdo do plano', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<MealPlanEditor {...editorProps} onSave={onSave} onPublish={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Título do plano'), { target: { value: 'Plano revisado' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar rascunho/ })));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0] as PlanContent;
    expect(saved.title).toBe('Plano revisado');
    expect(saved.meals[0]?.items[0]).toMatchObject({ foodId: '3', quantityG: 150 });
    expect(saved.guidelines).toBe('Beber 2 L de água por dia.');
    expect(planContentSchema.safeParse(saved).success).toBe(true);
  });
  it('publicado fica só leitura', () => {
    render(<MealPlanEditor {...editorProps} readOnly />);
    expect(screen.queryByRole('button', { name: /Salvar rascunho/ })).toBeNull();
    expect((screen.getByLabelText('Título do plano') as HTMLInputElement).disabled).toBe(true);
  });
});
