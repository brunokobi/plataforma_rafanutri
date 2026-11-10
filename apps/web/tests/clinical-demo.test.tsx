import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MealPlanEditor } from '@/components/clinical/meal-plan-editor';
import { AssessmentForm } from '@/components/clinical/assessment-form';
import { DEMO_FOODS, DEMO_PLAN, foodById, searchDemoFoods } from '@/lib/demo/foods';

afterEach(cleanup);

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
    render(<MealPlanEditor />);
    expect(screen.getByText('Plano × metas')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Energia: .*% da meta/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Qualitativo/ }));
    expect(screen.queryByRole('img', { name: /Energia/ })).toBeNull();
    expect(screen.queryAllByLabelText(/Quantidade de/)).toHaveLength(0);
  });

  it('sugere substituições equivalentes do mesmo grupo', async () => {
    render(<MealPlanEditor />);
    const buttons = screen.getAllByRole('button', { name: /Substituições/ });
    // 4º item do plano = arroz do almoço (café tem 3 itens)
    await act(async () => fireEvent.click(buttons[3]!));
    expect(screen.getByText(/Equivalentes em energia, mesmo grupo/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Adicionar' }).length).toBeGreaterThan(0);
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
