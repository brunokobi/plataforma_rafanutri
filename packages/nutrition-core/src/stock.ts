// RN-143 — Estoque: escolha de lotes por FEFO (a validade mais próxima sai primeiro). O banco faz a baixa
// com a mesma regra (stock_out_fefo); esta função serve para mostrar a prévia na tela.
import { NutritionInputError } from './errors';

export interface LotInput { id: string; quantityG: number; expiresOn: string | null; receivedAt: string }

/** Lotes e quantidades a consumir; erro se o saldo não basta. Sem validade vai por último; empate pela entrada. */
export function pickLotsFefo(lots: LotInput[], quantityG: number): Array<{ id: string; takeG: number }> {
  if (!(quantityG > 0)) throw new NutritionInputError('INVALID_INPUT', 'quantityG', 'Quantidade inválida.');
  const available = lots.reduce((s, l) => s + Math.max(0, l.quantityG), 0);
  if (available < quantityG) throw new NutritionInputError('OUT_OF_RANGE', 'quantityG', `Saldo insuficiente: há ${available} g.`);
  const ordered = [...lots].filter((l) => l.quantityG > 0).sort((a, b) =>
    (a.expiresOn ?? '9999-12-31').localeCompare(b.expiresOn ?? '9999-12-31') || a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
  const out: Array<{ id: string; takeG: number }> = [];
  let remaining = quantityG;
  for (const l of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(l.quantityG, remaining);
    out.push({ id: l.id, takeG: take });
    remaining -= take;
  }
  return out;
}
