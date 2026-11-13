import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomFoodForm, portionTo100g } from '@/components/foods/custom-food-form';
import { CustomFoods, filterCustomFoods } from '@/components/foods/custom-foods';
import { previewPer100g, RecipeForm } from '@/components/foods/recipe-form';
import type { CustomFood } from '@/lib/foods/custom';
import { foodOriginLabel, type Food } from '@/lib/foods/food';

type R = { ok: true; id: string; per100g?: Record<string, number | null> } | { ok: false; message: string; fields?: Record<string, string> };
const saveCustomFood = vi.fn<(input: unknown, id?: string) => Promise<R>>(async () => ({ ok: true, id: '700' }));
const saveRecipe = vi.fn<(input: unknown, id?: string) => Promise<R>>(async () => ({ ok: true, id: '701', per100g: { energy_kcal: 200.5 } }));
const setFoodArchived = vi.fn<(id: string, archived: boolean) => Promise<R>>(async (id) => ({ ok: true, id }));
vi.mock('@/lib/foods/custom-actions', () => ({
  saveCustomFood: (i: unknown, id?: string) => saveCustomFood(i, id),
  saveRecipe: (i: unknown, id?: string) => saveRecipe(i, id),
  setFoodArchived: (id: string, a: boolean) => setFoodArchived(id, a),
}));
const food = (id: string, name: string, kcal: number, extra: Partial<Food> = {}): Food => ({
  id, name, group: 'Cereais e derivados', source: 'TACO', kind: 'food', householdMeasures: [],
  per100g: { energy_kcal: kcal, protein_g: 7, carbohydrate_g: 78, lipid_g: 1, fiber_g: 1.6 }, ...extra,
});
const ARROZ = food('4', 'Arroz, tipo 1, cru', 358);
const searchFoods = vi.fn(async (q: string) => ({ ok: true as const, foods: q.includes('arroz') ? [ARROZ] : [] }));
vi.mock('@/lib/foods/actions', () => ({ searchFoods: (q: string) => searchFoods(q), foodsInGroup: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('conversões e prévias', () => {
  it('porção do rótulo de 30 g → por 100 g', () => {
    expect(portionTo100g(120, 30)).toBe(400);
    expect(portionTo100g(3.3, 30)).toBe(11);
    expect(portionTo100g(null, 30)).toBeNull();
    expect(portionTo100g(10, 0)).toBeNull();
  });
  it('prévia da preparação por 100 g pronta (rendimento)', () => {
    const p = previewPer100g([{ food: ARROZ, quantityG: 200 }, { food: food('260', 'Azeite', 884, { per100g: { energy_kcal: 884, protein_g: null } }), quantityG: 10 }], 520)!;
    expect(p.per100g.energy_kcal).toBeCloseTo((716 + 88.4) / 5.2, 1);
    expect(p.incomplete).toContain('protein_g');
    expect(previewPer100g([], 100)).toBeNull();
    expect(previewPer100g([{ food: ARROZ, quantityG: 10 }], 0)).toBeNull();
  });
  it('etiqueta de origem na busca', () => {
    expect(foodOriginLabel({ source: 'CUSTOM', kind: 'food' })).toBe('Próprio');
    expect(foodOriginLabel({ source: 'CUSTOM', kind: 'recipe' })).toBe('Preparação');
    expect(foodOriginLabel({ source: 'TACO', kind: 'food' })).toBeNull();
  });
});

describe('formulário de alimento próprio', () => {
  it('cadastra pelo rótulo mostrando a conversão para 100 g', async () => {
    const onDone = vi.fn();
    render(<CustomFoodForm onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Barra de cereal X' } });
    fireEvent.change(screen.getByLabelText('Porção do rótulo (g)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Energia (kcal) *'), { target: { value: '120' } });
    expect(screen.getByText('= 400 kcal em 100 g')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Medida/ }));
    fireEvent.change(screen.getByLabelText('Medida'), { target: { value: 'unidade' } });
    fireEvent.change(screen.getByLabelText('Gramas'), { target: { value: '30' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alimento' })));
    expect(saveCustomFood).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Barra de cereal X', basis: 'portion', portion_g: '30', nutrients: expect.objectContaining({ energy_kcal: '120' }), household_measures: [{ label: 'unidade', grams: '30' }] }),
      undefined,
    );
    expect(onDone).toHaveBeenCalled();
  });
  it('mostra os erros por campo vindos do servidor', async () => {
    saveCustomFood.mockResolvedValueOnce({ ok: false, message: 'Revise os campos destacados.', fields: { energy_kcal: 'Obrigatório.' } });
    render(<CustomFoodForm onDone={vi.fn()} onCancel={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar alimento' })));
    expect(screen.getByText('Obrigatório.')).toBeTruthy();
  });
  it('copia valores da TACO para ajustar', async () => {
    vi.useFakeTimers();
    render(<CustomFoodForm onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Copiar valores da TACO/), { target: { value: 'arroz' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.click(screen.getByRole('option', { name: 'Arroz, tipo 1, cru' }));
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Arroz, tipo 1, cru (ajustado)');
    expect((screen.getByLabelText('Energia (kcal) *') as HTMLInputElement).value).toBe('358');
    expect(screen.getByRole('radio', { name: 'Por 100 g' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('formulário de preparação', () => {
  it('adiciona ingrediente pela busca, mostra a prévia e salva', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RecipeForm onDone={onDone} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Arroz da casa' } });
    fireEvent.change(screen.getByLabelText('Buscar ingrediente'), { target: { value: 'arroz' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.click(screen.getByRole('option', { name: 'Arroz, tipo 1, cru' }));
    fireEvent.change(screen.getByLabelText('Quantidade de Arroz, tipo 1, cru em gramas'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Rendimento: peso pronto (g)'), { target: { value: '500' } });
    expect(screen.getByRole('status').textContent).toMatch(/143 kcal/); // 716 / 500 × 100
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar preparação' })));
    expect(saveRecipe).toHaveBeenCalledWith(expect.objectContaining({ name: 'Arroz da casa', yield_g: '500', items: [{ foodId: '4', quantityG: '200' }] }), undefined);
    expect(onDone).toHaveBeenCalledWith(expect.stringMatching(/201 kcal em 100 g/));
  });
});

const custom = (id: string, name: string, kind: 'food' | 'recipe', archived = false): CustomFood => ({ ...food(id, name, 400), source: 'CUSTOM', kind, archived });

describe('lista do consultório', () => {
  const list = [custom('1', 'Barra de cereal X', 'food'), custom('2', 'Granola antiga', 'food', true), custom('3', 'Bolo de banana', 'recipe')];
  it('separa alimentos e preparações, esconde arquivados e busca sem acento', () => {
    expect(filterCustomFoods(list, 'food', '', false).map((f) => f.id)).toEqual(['1']);
    expect(filterCustomFoods(list, 'food', '', true).map((f) => f.id)).toEqual(['1', '2']);
    expect(filterCustomFoods(list, 'recipe', 'bolo', false).map((f) => f.id)).toEqual(['3']);
  });
  it('arquiva pela lista e preparação abre a página de edição', async () => {
    render(<CustomFoods foods={list} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Arquivar Barra de cereal X' })));
    expect(setFoodArchived).toHaveBeenCalledWith('1', true);
    fireEvent.click(screen.getByRole('tab', { name: /Preparações/ }));
    const item = screen.getByRole('list', { name: 'Preparações do consultório' });
    expect(within(item).getByRole('link', { name: /Editar/ }).getAttribute('href')).toBe('/app/alimentos/preparacoes/3');
  });
});
