import { describe, expect, it } from 'vitest';
import { ING, RECIPES } from '../scripts/seed-uan-fichas';

describe('carga de fichas técnicas da UAN', () => {
  it('tem um cardápio completo, sem nomes repetidos', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(60);
    const names = RECIPES.map((r) => r.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const cat of ['main', 'side', 'garnish', 'salad', 'soup', 'dessert', 'beverage']) {
      expect(RECIPES.some((r) => r.category === cat)).toBe(true);
    }
  });
  it('todo item usa um insumo cadastrado, e o molho vem antes de quem o usa', () => {
    const molho = RECIPES.findIndex((r) => r.category === 'sauce');
    RECIPES.forEach((r, i) => {
      for (const line of r.items) {
        if (line[0] === 'sub:molho') expect(i).toBeGreaterThan(molho);
        else expect(ING).toHaveProperty(line[0]);
        expect(line[1]).toBeGreaterThan(0);
      }
    });
  });
  it('respeita os limites do banco (IC de 0,05 a 10, até 200 itens, passos com texto)', () => {
    for (const r of RECIPES) {
      expect(r.ic === undefined || r.yieldG === undefined).toBe(true);
      if (r.ic !== undefined) expect(r.ic).toBeGreaterThanOrEqual(0.05);
      if (r.ic !== undefined) expect(r.ic).toBeLessThanOrEqual(10);
      if (r.yieldG !== undefined) {
        const net = r.items.reduce((s, l) => s + (l[0] === 'sub:molho' ? l[1] : l[1] / (l[2] ?? ING[l[0]].fc)), 0);
        expect(r.yieldG / net).toBeLessThanOrEqual(10);
      }
      expect(r.items.length).toBeLessThanOrEqual(200);
      expect(r.steps.length).toBeGreaterThan(0);
    }
  });
  it('insumos por unidade têm peso e alergênicos válidos', () => {
    const allowed = ['gluten', 'eggs', 'fish', 'soy', 'milk', 'lactose'];
    for (const i of Object.values(ING) as Array<{ unit: string; unitWeight?: number; allergens?: string[]; fc: number }>) {
      if (i.unit === 'un') expect(i.unitWeight).toBeGreaterThan(0);
      for (const a of i.allergens ?? []) expect(allowed).toContain(a);
      expect(i.fc).toBeGreaterThanOrEqual(1);
    }
  });
});
