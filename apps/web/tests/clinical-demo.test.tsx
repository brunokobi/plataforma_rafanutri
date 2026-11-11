import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MealPlanEditor } from '@/components/clinical/meal-plan-editor';
import { AssessmentForm } from '@/components/clinical/assessment-form';
import { DEMO_FOODS, DEMO_PLAN, foodById, searchDemoFoods } from '@/lib/demo/foods';
import { demoFoodsAsFoods } from '@/lib/demo/taco-plan';
import type { Food } from '@/lib/foods/food';

// Server actions simuladas (no teste não há Directus).
const taco = (id: string, name: string, group: string, kcal: number, measures: Food['householdMeasures'] = []): Food => ({
  id, name, group, source: 'TACO', householdMeasures: measures,
  per100g: { energy_kcal: kcal, protein_g: 2, carbohydrate_g: 20, lipid_g: 1, fiber_g: 1 },
});
const ARROZ = taco('3', 'Arroz, tipo 1, cozido', 'Cereais e derivados', 128, [{ label: 'colher de sopa', grams: 25 }]);
const MACARRAO = taco('600', 'Macarrão, trigo, cozido', 'Cereais e derivados', 158);
const ARROZ_CRU = taco('4', 'Arroz, tipo 1, cru', 'Cereais e derivados', 358);
const FEIJAO = taco('561', 'Feijão, carioca, cozido', 'Leguminosas e derivados', 76, [{ label: 'concha média', grams: 80 }]);
const searchFoods = vi.fn(async (q: string) => ({ ok: true as const, foods: q.includes('feij') ? [FEIJAO] : [] }));
const foodsInGroup = vi.fn(async (group: string) => ({ ok: true as const, foods: [ARROZ, MACARRAO, ARROZ_CRU, FEIJAO].filter((f) => f.group === group) }));
vi.mock('@/lib/foods/actions', () => ({ searchFoods: (q: string) => searchFoods(q), foodsInGroup: (g: string) => foodsInGroup(g) }));

const offlineProps = { initialPlan: DEMO_PLAN, initialFoods: demoFoodsAsFoods(), offline: true };
const tacoPlan = [{ id: 'almoco', name: 'Almoço', time: '12:30', items: [{ key: 'a1', foodId: '3', quantityG: 150 }] }];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('base de alimentos de exemplo', () => {
  // Regra 4/4/9 com tolerância de 15% ou 8 kcal: em hortaliças o carboidrato inclui fibra, que rende
  // menos energia, então a regra superestima alimentos de pouquíssimas calorias.
  it.each(DEMO_FOODS.map((f) => [f.name, f] as const))('%s: energia coerente com os macros e com medida caseira', (_, f) => {
    const { energy_kcal, protein_g, carbohydrate_g, lipid_g } = f.per100g;
    const est = 4 * (protein_g ?? 0) + 4 * (carbohydrate_g ?? 0) + 9 * (lipid_g ?? 0);
    const diff = Math.abs(est - (energy_kcal ?? 0));
    expect(diff / (energy_kcal ?? 1) < 0.15 || diff <= 8).toBe(true);
    expect(f.householdMeasures.length).toBeGreaterThan(0);
  });
  it('plano de exemplo só usa alimentos da base', () => {
    for (const m of DEMO_PLAN) for (const i of m.items) expect(foodById(i.foodId)).toBeDefined();
  });
  it('busca ignora acentos', () => {
    expect(searchDemoFoods('feijao')[0]?.id).toBe('feijao');
    expect(searchDemoFoods('maca').map((f) => f.id)).toContain('maca');
  });
});

describe('MealPlanEditor', () => {
  it('mostra totais contra a meta e esconde números no modo qualitativo', () => {
    render(<MealPlanEditor {...offlineProps} />);
    expect(screen.getByText('Plano × metas')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Energia: .*% da meta/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Qualitativo/ }));
    expect(screen.queryByRole('img', { name: /Energia/ })).toBeNull();
    expect(screen.queryAllByLabelText(/Quantidade de/)).toHaveLength(0);
  });

  it('sugere substituições equivalentes do mesmo grupo', async () => {
    render(<MealPlanEditor {...offlineProps} />);
    const buttons = screen.getAllByRole('button', { name: /Substituições/ });
    // 4º item do plano = arroz do almoço (café tem 3 itens)
    await act(async () => fireEvent.click(buttons[3]!));
    expect(screen.getByText(/Equivalentes em energia, mesmo grupo/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Adicionar' }).length).toBeGreaterThan(0);
  });
});

describe('MealPlanEditor com a TACO', () => {
  it('busca na base do servidor e adiciona o alimento à refeição', async () => {
    vi.useFakeTimers();
    render(<MealPlanEditor initialPlan={tacoPlan} initialFoods={[ARROZ]} />);
    expect(screen.getByText('Alimentos da TACO 4ª edição')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: 'feijao' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(searchFoods).toHaveBeenCalledWith('feijao');
    await act(async () => fireEvent.click(screen.getByRole('option', { name: /Feijão, carioca, cozido/ })));
    expect(screen.getByText('Feijão, carioca, cozido')).toBeTruthy();
    // entra com a primeira medida caseira (1 concha média = 80 g)
    expect((screen.getByLabelText('Quantidade de Feijão, carioca, cozido em gramas') as HTMLInputElement).value).toBe('80');
  });

  it('busca equivalentes do grupo no servidor e não sugere alimento cru no lugar de cozido', async () => {
    render(<MealPlanEditor initialPlan={tacoPlan} initialFoods={[ARROZ]} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Substituições/ })));
    expect(foodsInGroup).toHaveBeenCalledWith('Cereais e derivados');
    expect(screen.getByText('Macarrão, trigo, cozido')).toBeTruthy();
    expect(screen.queryByText('Arroz, tipo 1, cru')).toBeNull();
  });

  it('avisa quando a base está fora do ar', async () => {
    vi.useFakeTimers();
    searchFoods.mockResolvedValueOnce({ ok: false, message: 'A base de alimentos está indisponível agora.' } as never);
    render(<MealPlanEditor initialPlan={tacoPlan} initialFoods={[ARROZ]} />);
    fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: 'arroz' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByText(/base de alimentos está indisponível/)).toBeTruthy();
  });
});

describe('AssessmentForm', () => {
  it('calcula IMC e gordura corporal ao vivo', () => {
    render(<AssessmentForm />);
    // 67,6 kg / 1,65² = 24,8
    expect(screen.getByText('24,8')).toBeTruthy();
    expect(screen.getByText('Gordura corporal')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '80' } });
    expect(screen.getByText('29,4')).toBeTruthy(); // 80 / 2,7225
  });
});
