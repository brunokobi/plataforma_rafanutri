import { describe, expect, it } from 'vitest';
import { buildMealPlanPdfData, pdfRecipes } from '@/lib/pdf/meal-plan-data';
import { planToWhatsappText, whatsappShareLink } from '@/lib/pdf/whatsapp';

const foods: Record<string, { name: string; per100g: Record<string, number | null>; householdMeasures: Array<{ label: string; grams: number }> }> = {
  '3': { name: 'Arroz, tipo 1, cozido', per100g: { energy_kcal: 128 }, householdMeasures: [{ label: 'colher de sopa', grams: 25 }] },
  '561': { name: 'Feijão, carioca, cozido', per100g: { energy_kcal: 76 }, householdMeasures: [{ label: 'concha média', grams: 80 }] },
  '900': { name: 'Bolo de banana da casa', per100g: { energy_kcal: 250 }, householdMeasures: [] },
};
const foodById = (id: string) => foods[id];
const meals = [
  { id: 'almoco', name: 'Almoço', time: '12:30', items: [{ foodId: '3', quantityG: 100, subs: [{ foodId: '561', quantityG: 160 }] }] },
  { id: 'lanche', name: 'Lanche', time: '16:00', items: [{ foodId: '900', quantityG: 60 }] },
  { id: 'ceia', name: 'Ceia', time: '21:00', items: [] },
];
const recipes = { '900': { yield_g: 800, servings: 10, instructions: 'Misture e asse por 40 minutos.', items: [{ name: 'Banana, prata, crua', quantityG: 300 }, { name: 'Aveia, flocos, crua', quantityG: 150 }] } };
const opts = {
  mode: 'quantitative' as const, showKcal: false, foodById, recipes, issuedAt: new Date('2026-11-13T12:00:00Z'),
  practice: { practiceName: 'Consultório X', professionalName: 'Dra. Ana', crn: '12345', crnRegion: 'CRN-9', color: '#2E7D32', contact: '' },
  patient: { name: 'Rafael Lima', objective: '' }, guidelines: ['Beba água ao longo do dia.'],
};

describe('preparações no PDF', () => {
  it('lista ingredientes e modo de preparo das preparações usadas no plano, sem repetir', () => {
    const r = pdfRecipes([...meals, meals[1]!], foodById, recipes);
    expect(r).toEqual([{ name: 'Bolo de banana da casa', yieldText: 'Rende 800 g (10 porções)', ingredients: ['300 g de banana, prata, crua', '150 g de aveia, flocos, crua'], instructions: 'Misture e asse por 40 minutos.' }]);
    expect(buildMealPlanPdfData(meals, opts).recipes).toHaveLength(1);
    expect(buildMealPlanPdfData(meals, { ...opts, recipes: undefined }).recipes).toEqual([]);
  });
});

describe('plano por WhatsApp', () => {
  it('texto com refeições, medidas, substituições, orientações, preparações e assinatura', () => {
    const text = planToWhatsappText(buildMealPlanPdfData(meals, opts), 'Rafael');
    expect(text).toMatch(/^Olá, Rafael! Segue o seu plano alimentar, válido até 13\/12\/2026\./);
    expect(text).toContain('*12:30 · Almoço*\n• 4 colheres de sopa de arroz, tipo 1, cozido\n  ou 2 conchas médias de feijão, carioca, cozido');
    expect(text).not.toContain('Ceia'); // refeição vazia não entra
    expect(text).toContain('*Orientações*\n• Beba água ao longo do dia.');
    expect(text).toContain('*Preparações*\n• Bolo de banana da casa: 300 g de banana, prata, crua; 150 g de aveia, flocos, crua. Misture e asse por 40 minutos.');
    expect(text.trim().endsWith('Dra. Ana · CRN-9 12345')).toBe(true);
  });
  it('modo qualitativo não mostra quantidades', () => {
    const text = planToWhatsappText(buildMealPlanPdfData(meals, { ...opts, mode: 'qualitative' }), 'Rafael');
    expect(text).toContain('• Arroz, tipo 1, cozido');
    expect(text).not.toContain('colheres');
  });
  it('link wa.me com o celular do paciente e texto codificado', () => {
    expect(whatsappShareLink('+5531988880002', 'Oi & tchau')).toBe('https://wa.me/5531988880002?text=Oi%20%26%20tchau');
    expect(whatsappShareLink(null, 'x')).toBe('https://wa.me/?text=x');
  });
});
