// RN-169 — Importação de planilhas na implantação: leitura de CSV (Excel salva como CSV), mapeamento das
// colunas pelos nomes em português, validação linha a linha e modelos para download.

export type ImportKind = 'insumos' | 'fornecedores' | 'fichas';
export interface RowError { line: number; message: string }

/** Lê CSV com separador ";", "," ou tabulação (o mais frequente no cabeçalho), aspas e BOM. Linha 1 = cabeçalho. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0]![1] > 0 ? counts[0]![0] : ';';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** "Unidade de compra" → "unidade_de_compra". */
export const normKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Linhas como objetos pela coluna canônica (aceita sinônimos). Devolve também as colunas que não reconheceu. */
export function toRecords(rows: string[][], columns: Record<string, string[]>): { records: Array<{ line: number; values: Record<string, string> }>; unknown: string[]; missing: string[] } {
  const header = (rows[0] ?? []).map(normKey);
  const index: Record<string, number> = {};
  const unknown: string[] = [];
  header.forEach((h, i) => {
    const canon = Object.entries(columns).find(([k, syn]) => k.replace('*', '') === h || syn.includes(h))?.[0];
    if (canon && index[canon] === undefined) index[canon] = i;
    else if (h) unknown.push(rows[0]![i]!.trim());
  });
  const required = Object.keys(columns).filter((k) => k.endsWith('*')).map((k) => k);
  const missing = required.filter((k) => index[k] === undefined).map((k) => k.replace('*', ''));
  const records = rows.slice(1).map((r, n) => ({
    line: n + 2,
    values: Object.fromEntries(Object.entries(index).map(([k, i]) => [k.replace('*', ''), (r[i] ?? '').trim()])),
  }));
  return { records, unknown, missing };
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const t = s.replace(/\s|R\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const pick = <T extends string>(s: string | undefined, map: Record<string, T>, fallback: T | null): T | null | undefined => {
  if (!s) return fallback;
  return map[normKey(s)];
};

const CATEGORY: Record<string, string> = {
  hortifruti: 'produce', hortifrutigranjeiros: 'produce', frutas: 'produce', verduras: 'produce', legumes: 'produce', produce: 'produce',
  carnes: 'meat', carne: 'meat', proteinas: 'meat', meat: 'meat', laticinios: 'dairy', laticinio: 'dairy', dairy: 'dairy',
  graos: 'grains', cereais: 'grains', grains: 'grains', panificacao: 'bakery', padaria: 'bakery', bakery: 'bakery',
  bebidas: 'beverages', beverages: 'beverages', congelados: 'frozen', frozen: 'frozen', mercearia: 'grocery', grocery: 'grocery',
  limpeza: 'cleaning', cleaning: 'cleaning', descartaveis: 'disposables', disposables: 'disposables', outros: 'other', outro: 'other', other: 'other',
};
const UNIT: Record<string, string> = { kg: 'kg', quilo: 'kg', g: 'g', grama: 'g', l: 'l', litro: 'l', ml: 'ml', un: 'un', unidade: 'un', dz: 'dz', duzia: 'dz', cx: 'cx', caixa: 'cx', pct: 'pct', pacote: 'pct' };
const STORAGE: Record<string, string> = { ambiente: 'ambient', seco: 'ambient', ambient: 'ambient', refrigerado: 'chilled', resfriado: 'chilled', chilled: 'chilled', congelado: 'frozen', frozen: 'frozen' };
const ALLERGEN: Record<string, string> = {
  gluten: 'gluten', trigo: 'gluten', crustaceos: 'crustaceans', crustaceo: 'crustaceans', ovos: 'eggs', ovo: 'eggs', peixes: 'fish', peixe: 'fish',
  amendoim: 'peanut', soja: 'soy', leite: 'milk', lactose: 'lactose', amendoa: 'almond', amendoas: 'almond', avela: 'hazelnut', avelas: 'hazelnut',
  castanha_de_caju: 'cashew', caju: 'cashew', castanha_do_para: 'brazil_nut', castanha_do_brasil: 'brazil_nut', macadamia: 'macadamia',
  nozes: 'walnut', noz: 'walnut', peca: 'pecan', pecas: 'pecan', pistache: 'pistachio', pinoli: 'pine_nut', castanhas: 'chestnut', castanha: 'chestnut', latex: 'latex',
};
const SHEET_CATEGORY: Record<string, string> = {
  prato_principal: 'main', principal: 'main', main: 'main', guarnicao: 'garnish', garnish: 'garnish', acompanhamento: 'side', side: 'side',
  salada: 'salad', salad: 'salad', sopa: 'soup', soup: 'soup', sobremesa: 'dessert', dessert: 'dessert', pao: 'bread', paes: 'bread', bread: 'bread',
  bebida: 'beverage', suco: 'beverage', beverage: 'beverage', molho: 'sauce', sauce: 'sauce', base: 'base', preparacao_base: 'base', outro: 'other', other: 'other',
};

export const INGREDIENT_COLUMNS: Record<string, string[]> = {
  'nome*': ['insumo', 'nome_do_insumo', 'produto', 'descricao'],
  categoria: ['grupo'],
  unidade_compra: ['unidade', 'unidade_de_compra', 'und', 'un_compra'],
  armazenamento: ['armazenagem', 'conservacao'],
  fc: ['fator_de_correcao', 'fator_correcao'],
  densidade: ['densidade_g_ml'],
  peso_unidade_g: ['peso_da_unidade', 'peso_unidade', 'peso_unitario_g'],
  peso_embalagem_g: ['peso_da_embalagem', 'peso_embalagem', 'conteudo_g'],
  estoque_minimo: ['minimo', 'estoque_min'],
  alergenicos: ['alergenos', 'alergenico'],
  acucar_adicionado: ['acucares_adicionados', 'acucar_adicionado_g_100g', 'acucares_adicionados_g_100g'],
  fornecedor: ['fornecedor_principal'],
  preco: ['preco_unitario', 'preco_r', 'valor', 'preco_de_compra'],
  taco: ['alimento_taco', 'taco_tbca', 'alimento'],
};
export const SUPPLIER_COLUMNS: Record<string, string[]> = {
  'nome*': ['fornecedor', 'razao_social', 'nome_fantasia'],
  cnpj: [], contato: ['nome_do_contato', 'responsavel'], telefone: ['fone', 'celular', 'whatsapp'], email: ['e_mail'],
};
export const SHEET_COLUMNS: Record<string, string[]> = {
  'ficha*': ['preparacao', 'nome_da_ficha', 'receita', 'ficha_tecnica'],
  categoria: ['tipo'],
  porcoes: ['rendimento_porcoes', 'n_porcoes', 'numero_de_porcoes'],
  peso_pronto_g: ['peso_pronto', 'rendimento_g'],
  'insumo*': ['ingrediente', 'item'],
  'peso_bruto_g*': ['peso_bruto', 'pb', 'pb_g', 'quantidade_g'],
  fc: ['fator_de_correcao'],
};

export interface IngredientImport {
  line: number; name: string; category: string; purchase_unit: string; storage: string; default_fc: number; density_g_ml: number | null;
  unit_weight_g: number | null; pack_grams: number | null; min_stock: number | null; allergens: string[]; added_sugar_g_100g: number | null;
  supplier: string | null; price: number | null; taco: string | null;
}

/** Valida as linhas de insumos; nomes repetidos na planilha ficam só na primeira. */
export function validateIngredients(records: Array<{ line: number; values: Record<string, string> }>): { valid: IngredientImport[]; errors: RowError[] } {
  const valid: IngredientImport[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  for (const { line, values: v } of records) {
    const err = (m: string) => errors.push({ line, message: m });
    const name = (v.nome ?? '').trim();
    if (name.length < 2 || name.length > 120) { err('Nome do insumo ausente ou longo demais.'); continue; }
    const key = normKey(name);
    if (seen.has(key)) { err(`"${name}" repetido na planilha.`); continue; }
    const category = pick(v.categoria, CATEGORY, 'other');
    if (!category) { err(`Categoria "${v.categoria}" não reconhecida.`); continue; }
    const unit = pick(v.unidade_compra, UNIT, 'kg');
    if (!unit) { err(`Unidade "${v.unidade_compra}" não reconhecida (use kg, g, L, mL, un, dz, cx ou pct).`); continue; }
    const storage = pick(v.armazenamento, STORAGE, 'ambient');
    if (!storage) { err(`Armazenamento "${v.armazenamento}" não reconhecido (ambiente, refrigerado ou congelado).`); continue; }
    const fc = num(v.fc) ?? 1;
    const density = num(v.densidade);
    const unitW = num(v.peso_unidade_g);
    const pack = num(v.peso_embalagem_g);
    const minStock = num(v.estoque_minimo);
    const sugar = num(v.acucar_adicionado);
    const price = num(v.preco);
    if (Number.isNaN(fc) || fc < 1 || fc > 20) { err('Fator de correção entre 1 e 20.'); continue; }
    if (Number.isNaN(density) || (density !== null && (density < 0.1 || density > 5))) { err('Densidade entre 0,1 e 5.'); continue; }
    if ([unitW, pack, minStock, sugar, price].some((x) => Number.isNaN(x) || (x !== null && x < 0))) { err('Número inválido em peso, estoque, açúcar ou preço.'); continue; }
    if (sugar !== null && sugar > 100) { err('Açúcar adicionado de 0 a 100 g por 100 g.'); continue; }
    if ((unit === 'un' || unit === 'dz') && !unitW) { err('Informe o peso da unidade em gramas (unidade "un" ou "dz").'); continue; }
    if ((unit === 'cx' || unit === 'pct') && !pack) { err('Informe o peso da embalagem em gramas (unidade "cx" ou "pct").'); continue; }
    const allergenNames = (v.alergenicos ?? '').split(/[|,;/]/).map((x) => x.trim()).filter(Boolean);
    const allergens = allergenNames.map((a) => ALLERGEN[normKey(a)]);
    if (allergens.some((a) => !a)) { err(`Alergênico não reconhecido: ${allergenNames.filter((a) => !ALLERGEN[normKey(a)]).join(', ')}.`); continue; }
    seen.add(key);
    valid.push({
      line, name, category, purchase_unit: unit, storage, default_fc: fc, density_g_ml: density, unit_weight_g: unitW, pack_grams: pack, min_stock: minStock,
      allergens: [...new Set(allergens as string[])], added_sugar_g_100g: sugar, supplier: v.fornecedor?.trim() || null, price: price && price > 0 ? price : null, taco: v.taco?.trim() || null,
    });
  }
  return { valid, errors };
}

export interface SupplierImport { line: number; name: string; cnpj: string | null; contact_name: string | null; phone: string | null; email: string | null }
export function validateSuppliers(records: Array<{ line: number; values: Record<string, string> }>): { valid: SupplierImport[]; errors: RowError[] } {
  const valid: SupplierImport[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  for (const { line, values: v } of records) {
    const name = (v.nome ?? '').trim();
    if (name.length < 2 || name.length > 120) { errors.push({ line, message: 'Nome do fornecedor ausente ou longo demais.' }); continue; }
    if (seen.has(normKey(name))) { errors.push({ line, message: `"${name}" repetido na planilha.` }); continue; }
    const cnpj = (v.cnpj ?? '').replace(/\D/g, '');
    if (cnpj && cnpj.length !== 14) { errors.push({ line, message: 'CNPJ com 14 dígitos.' }); continue; }
    const email = (v.email ?? '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errors.push({ line, message: 'E-mail inválido.' }); continue; }
    seen.add(normKey(name));
    valid.push({ line, name, cnpj: cnpj || null, contact_name: v.contato?.trim().slice(0, 120) || null, phone: v.telefone?.trim().slice(0, 30) || null, email: email || null });
  }
  return { valid, errors };
}

export interface SheetImport { lines: number[]; name: string; category: string; servings: number; cooked_weight_g: number | null; items: Array<{ line: number; ingredient: string; gross_g: number; fc: number | null }> }
/** Fichas em formato "uma linha por ingrediente": as linhas com o mesmo nome de ficha formam uma ficha. */
export function validateSheets(records: Array<{ line: number; values: Record<string, string> }>): { valid: SheetImport[]; errors: RowError[] } {
  const groups = new Map<string, SheetImport>();
  const errors: RowError[] = [];
  const bad = new Set<string>();
  for (const { line, values: v } of records) {
    const name = (v.ficha ?? '').trim();
    if (name.length < 2 || name.length > 120) { errors.push({ line, message: 'Nome da ficha ausente.' }); continue; }
    const key = normKey(name);
    let g = groups.get(key);
    if (!g) {
      const category = pick(v.categoria, SHEET_CATEGORY, 'main');
      const servings = num(v.porcoes) ?? 10;
      const cooked = num(v.peso_pronto_g);
      if (!category) { errors.push({ line, message: `Categoria "${v.categoria}" não reconhecida.` }); bad.add(key); continue; }
      if (Number.isNaN(servings) || servings < 1 || servings > 10000 || !Number.isInteger(servings)) { errors.push({ line, message: 'Porções: número inteiro de 1 a 10.000.' }); bad.add(key); continue; }
      if (Number.isNaN(cooked) || (cooked !== null && cooked <= 0)) { errors.push({ line, message: 'Peso pronto inválido.' }); bad.add(key); continue; }
      g = { lines: [], name, category, servings, cooked_weight_g: cooked, items: [] };
      groups.set(key, g);
    }
    const ing = (v.insumo ?? '').trim();
    const gross = num(v.peso_bruto_g);
    const fc = num(v.fc);
    if (ing.length < 2) { errors.push({ line, message: 'Insumo ausente.' }); bad.add(key); continue; }
    if (gross === null || Number.isNaN(gross) || gross <= 0) { errors.push({ line, message: `Peso bruto inválido para ${ing}.` }); bad.add(key); continue; }
    if (Number.isNaN(fc) || (fc !== null && (fc < 1 || fc > 20))) { errors.push({ line, message: `Fator de correção inválido para ${ing}.` }); bad.add(key); continue; }
    g.lines.push(line);
    g.items.push({ line, ingredient: ing, gross_g: gross, fc });
  }
  for (const k of bad) {
    const g = groups.get(k);
    if (g && g.items.length) errors.push({ line: g.lines[0]!, message: `A ficha "${g.name}" tem linhas com erro e não será importada.` });
    groups.delete(k);
  }
  return { valid: [...groups.values()], errors: errors.sort((a, b) => a.line - b.line) };
}

/** Modelos para baixar (cabeçalho + exemplos), já no formato que o importador lê. */
export const TEMPLATES: Record<ImportKind, string[][]> = {
  insumos: [
    ['nome', 'categoria', 'unidade_compra', 'armazenamento', 'fc', 'densidade', 'peso_unidade_g', 'peso_embalagem_g', 'estoque_minimo', 'alergenicos', 'acucar_adicionado', 'fornecedor', 'preco', 'taco'],
    ['Arroz branco tipo 1', 'grãos', 'kg', 'ambiente', '1', '', '', '', '20', '', '', 'Atacado Central', '5,49', 'Arroz, tipo 1, cru'],
    ['Leite integral', 'laticínios', 'L', 'refrigerado', '1', '1,03', '', '', '10', 'leite | lactose', '', 'Laticínios Bom Dia', '4,99', 'Leite, de vaca, integral'],
    ['Ovo de galinha', 'laticínios', 'dz', 'refrigerado', '1,12', '', '50', '', '5', 'ovos', '', '', '12,90', 'Ovo, de galinha, inteiro, cru'],
  ],
  fornecedores: [
    ['nome', 'cnpj', 'contato', 'telefone', 'email'],
    ['Atacado Central', '12.345.678/0001-90', 'Marcos', '(27) 99999-0000', 'vendas@atacado.example.com'],
  ],
  fichas: [
    ['ficha', 'categoria', 'porcoes', 'peso_pronto_g', 'insumo', 'peso_bruto_g', 'fc'],
    ['Arroz branco', 'acompanhamento', '10', '2200', 'Arroz branco tipo 1', '1000', '1'],
    ['Arroz branco', 'acompanhamento', '10', '2200', 'Óleo de soja', '30', ''],
  ],
};
export const csvOf = (rows: string[][]) => `﻿${rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n')}\r\n`;
