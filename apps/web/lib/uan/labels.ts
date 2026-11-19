// U7 — Rótulo nutricional (RN-162 a RN-164): valores a partir da ficha aprovada, tabela no formato vertical
// da IN 75/2020 em SVG, lupa frontal e declaração de alergênicos. Dimensões e regras A VALIDAR com a RT.
import {
  FRONT_LABEL,
  frontWarnings,
  LABEL_ROWS,
  nutritionTable,
  type FrontWarning,
  type LabelNutrient,
  type NutritionTable,
  type PhysicalState,
} from '@rafanutri/nutrition-core';

export type LabelLayout = 'vertical' | 'horizontal' | 'linear';
export interface LabelValues { per100: Record<LabelNutrient, number | null>; perPortion: Record<LabelNutrient, number | null>; vd: Record<LabelNutrient, number | null> }
export interface LabelRecord {
  id: string;
  sheet_id: string;
  sheet_root_id: string;
  sheet_version: number;
  product_name: string;
  physical_state: PhysicalState;
  portion_g: number;
  household_measure: string;
  servings_per_pack: number | null;
  values: LabelValues;
  front_warnings: FrontWarning[];
  allergens: string[];
  allergen_statement: string | null;
  layout: LabelLayout;
  archived: boolean;
  created_at: string;
  created_by_name?: string | null;
}
export interface SheetLabels { can_issue: boolean; labels: LabelRecord[] }

/** Valores por 100 g da ficha (nutrientes calculados) + os informados à mão (açúcares totais e trans). */
export function labelPer100(sheetPer100: Record<string, number>, manual: { total_sugar_g: number | null; trans_fat_g: number | null }): Record<LabelNutrient, number | null> {
  const pick = (k: string) => (Number.isFinite(sheetPer100[k]) ? sheetPer100[k]! : null);
  return {
    energy_kcal: pick('energy_kcal'), carbohydrate_g: pick('carbohydrate_g'), total_sugar_g: manual.total_sugar_g, added_sugar_g: pick('added_sugar_g') ?? 0,
    protein_g: pick('protein_g'), lipid_g: pick('lipid_g'), saturated_fat_g: pick('saturated_fat_g'), trans_fat_g: manual.trans_fat_g,
    fiber_g: pick('fiber_g'), sodium_mg: pick('sodium_mg'),
  };
}

/** Tabela + valores para gravar + lupa. Açúcares totais abaixo dos adicionados é inconsistente. */
export function buildLabel(per100: Record<LabelNutrient, number | null>, portionG: number, state: PhysicalState): { table: NutritionTable; values: LabelValues; warnings: FrontWarning[]; problems: string[] } {
  const table = nutritionTable(per100, portionG);
  const values = { per100: {}, perPortion: {}, vd: {} } as LabelValues;
  for (const r of table.rows) { values.per100[r.key] = r.per100; values.perPortion[r.key] = r.perPortion; values.vd[r.key] = r.vdPct; }
  const problems: string[] = [];
  const names = Object.fromEntries(LABEL_ROWS.map((r) => [r.key, r.label]));
  if (table.missing.length) problems.push(`Sem valor: ${table.missing.map((k) => names[k]).join(', ')}.`);
  if (per100.total_sugar_g !== null && per100.added_sugar_g !== null && per100.total_sugar_g < per100.added_sugar_g) problems.push('Açúcares totais não podem ser menores que os adicionados.');
  if (per100.saturated_fat_g !== null && per100.lipid_g !== null && per100.saturated_fat_g > per100.lipid_g) problems.push('Gorduras saturadas maiores que as totais.');
  return { table, values, warnings: frontWarnings(per100, state), problems };
}

const fmt = (v: number | null, unit: string) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unit === 'kcal' ? ' kcal' : ` ${unit}`}`);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Quebra o texto em linhas de até `max` caracteres. */
export function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((cur ? `${cur} ${w}` : w).length > max && cur) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** SVG do rótulo: tabela vertical (IN 75/2020), lupa "ALTO EM" e declaração de alergênicos. */
export function labelSvg(l: Pick<LabelRecord, 'product_name' | 'physical_state' | 'portion_g' | 'household_measure' | 'servings_per_pack' | 'values' | 'front_warnings' | 'allergen_statement'>): string {
  const W = 320;
  const unit = l.physical_state === 'liquid' ? 'mL' : 'g';
  const portion = `${l.portion_g.toLocaleString('pt-BR')} ${unit}`;
  const cols = [8, 168, 228, 290]; // rótulo, 100 g, porção, %VD (alinhados à direita nas 3 últimas)
  const out: string[] = [];
  let y = 0;
  const text = (x: number, yy: number, s: string, o: { bold?: boolean; size?: number; anchor?: 'start' | 'end' | 'middle'; fill?: string } = {}) =>
    out.push(`<text x="${x}" y="${yy}" font-family="Helvetica, Arial, sans-serif" font-size="${o.size ?? 10}"${o.bold ? ' font-weight="bold"' : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''} fill="${o.fill ?? '#000'}">${esc(s)}</text>`);
  const line = (yy: number, w = 1) => out.push(`<line x1="4" y1="${yy}" x2="${W - 4}" y2="${yy}" stroke="#000" stroke-width="${w}"/>`);

  // lupa frontal acima da tabela
  if (l.front_warnings.length) {
    const h = 38 + l.front_warnings.length * 16;
    out.push(`<rect x="4" y="4" width="150" height="${h}" fill="#000"/>`);
    out.push(`<circle cx="24" cy="22" r="8" fill="none" stroke="#fff" stroke-width="2.5"/><line x1="30" y1="28" x2="36" y2="34" stroke="#fff" stroke-width="3"/>`);
    text(44, 26, 'ALTO EM', { bold: true, size: 13, fill: '#fff' });
    l.front_warnings.forEach((w, i) => {
      out.push(`<rect x="10" y="${36 + i * 16}" width="138" height="14" fill="#fff"/>`);
      text(79, 47 + i * 16, FRONT_LABEL[w], { bold: true, size: 9.5, anchor: 'middle' });
    });
    y = h + 14;
  }

  const top = y;
  y += 18;
  text(W / 2, y, 'INFORMAÇÃO NUTRICIONAL', { bold: true, size: 13, anchor: 'middle' });
  y += 6; line(y, 1);
  if (l.servings_per_pack) { y += 13; text(8, y, `Porções por embalagem: ${l.servings_per_pack.toLocaleString('pt-BR')}`); }
  y += 13; text(8, y, `Porção: ${portion} (${l.household_measure})`);
  y += 6; line(y, 3);
  y += 13;
  text(cols[1]!, y, `100 ${unit}`, { bold: true, anchor: 'end' });
  text(cols[2]!, y, portion, { bold: true, anchor: 'end' });
  text(cols[3]!, y, '%VD*', { bold: true, anchor: 'end' });
  y += 5; line(y, 1.5);
  for (const r of LABEL_ROWS) {
    y += 14;
    text(r.indent ? 18 : 8, y, r.label, { bold: !r.indent });
    text(cols[1]!, y, fmt(l.values.per100[r.key] ?? null, r.unit), { anchor: 'end' });
    text(cols[2]!, y, fmt(l.values.perPortion[r.key] ?? null, r.unit), { anchor: 'end' });
    const vd = l.values.vd[r.key];
    text(cols[3]!, y, vd === null || vd === undefined ? '' : `${vd}`, { anchor: 'end' });
    y += 4; line(y, 0.5);
  }
  y += 2; line(y, 3);
  y += 12; text(8, y, '*Percentual de valores diários fornecidos pela porção.', { size: 8 });
  y += 6;
  out.unshift(`<rect x="4" y="${top}" width="${W - 8}" height="${y - top}" fill="#fff" stroke="#000" stroke-width="1.5"/>`);

  if (l.allergen_statement) {
    y += 8;
    for (const ln of wrapText(l.allergen_statement, 52)) { y += 12; text(4, y, ln, { bold: true, size: 9.5 }); }
  }
  y += 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="${W}" height="${y}" fill="#fff"/>${out.join('')}</svg>`;
}
