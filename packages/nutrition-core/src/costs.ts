// U5 (RN-229) — Custos da UAN: planejado × realizado, desvio por produto e curva ABC.
import { NutritionInputError } from './errors';

/** Diferença percentual do realizado sobre o planejado (R$ 12,00 → R$ 13,10 = +9,2%); null sem planejado. */
export function deviationPct(planned: number, actual: number): number | null {
  if (!Number.isFinite(planned) || !Number.isFinite(actual)) throw new NutritionInputError('INVALID_INPUT', 'planned', 'Valores inválidos.');
  if (planned <= 0) return null;
  return Math.round(((actual - planned) / planned) * 1000) / 10;
}

/** Custo por refeição (centavos); null sem refeições. */
export function perCapitaCents(costCents: number, meals: number): number | null {
  return meals > 0 ? Math.round(costCents / meals) : null;
}

export interface DeviationLine { key: string; name: string; plannedCents: number; actualCents: number; diffCents: number }

/** Produtos que mais explicam o desvio (maior diferença absoluta entre realizado e planejado). */
export function topDeviations(
  planned: ReadonlyMap<string, { name: string; cents: number }>,
  actual: ReadonlyMap<string, { name: string; cents: number }>,
  n = 5,
): DeviationLine[] {
  const keys = new Set([...planned.keys(), ...actual.keys()]);
  return [...keys]
    .map((key) => {
      const p = planned.get(key)?.cents ?? 0;
      const a = actual.get(key)?.cents ?? 0;
      return { key, name: actual.get(key)?.name ?? planned.get(key)?.name ?? key, plannedCents: Math.round(p), actualCents: Math.round(a), diffCents: Math.round(a - p) };
    })
    .filter((l) => l.diffCents !== 0)
    .sort((x, y) => Math.abs(y.diffCents) - Math.abs(x.diffCents) || x.name.localeCompare(y.name, 'pt-BR'))
    .slice(0, n);
}

export interface AbcLine { key: string; name: string; valueCents: number; sharePct: number; cumulativePct: number; abc: 'A' | 'B' | 'C' }

/** Curva ABC: A até 80% do valor acumulado, B até 95%, C o resto (o item que cruza a faixa fica nela). */
export function abcCurve(items: Array<{ key: string; name: string; valueCents: number }>, aLimit = 80, bLimit = 95): AbcLine[] {
  const valid = items.filter((i) => i.valueCents > 0).sort((x, y) => y.valueCents - x.valueCents || x.name.localeCompare(y.name, 'pt-BR'));
  const total = valid.reduce((s, i) => s + i.valueCents, 0);
  if (total === 0) return [];
  let acc = 0;
  return valid.map((i) => {
    const before = (acc / total) * 100;
    acc += i.valueCents;
    const cumulativePct = Math.round((acc / total) * 1000) / 10;
    const abc: AbcLine['abc'] = before < aLimit ? 'A' : before < bLimit ? 'B' : 'C';
    return { ...i, sharePct: Math.round((i.valueCents / total) * 1000) / 10, cumulativePct, abc };
  });
}
