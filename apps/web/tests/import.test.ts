import { describe, expect, it } from 'vitest';
import { csvOf, INGREDIENT_COLUMNS, parseCsv, SHEET_COLUMNS, SUPPLIER_COLUMNS, TEMPLATES, toRecords, validateIngredients, validateSheets, validateSuppliers } from '@/lib/uan/import';

describe('importação de planilhas (RN-169)', () => {
  it('lê CSV com ponto e vírgula, aspas, BOM e linhas vazias', () => {
    expect(parseCsv('﻿nome;preco\r\n"Arroz; tipo 1";5,49\r\n\r\nFeijão;"7,90"\n')).toEqual([['nome', 'preco'], ['Arroz; tipo 1', '5,49'], ['Feijão', '7,90']]);
    expect(parseCsv('nome,preco\nA,"1,5"')).toEqual([['nome', 'preco'], ['A', '1,5']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('o modelo de insumos é válido e lido do jeito que é baixado', () => {
    const { records, unknown, missing } = toRecords(parseCsv(csvOf(TEMPLATES.insumos)), INGREDIENT_COLUMNS);
    expect(unknown).toEqual([]);
    expect(missing).toEqual([]);
    const { valid, errors } = validateIngredients(records);
    expect(errors).toEqual([]);
    expect(valid.map((v) => [v.name, v.category, v.purchase_unit, v.storage, v.allergens])).toEqual([
      ['Arroz branco tipo 1', 'grains', 'kg', 'ambient', []],
      ['Leite integral', 'dairy', 'l', 'chilled', ['milk', 'lactose']],
      ['Ovo de galinha', 'dairy', 'dz', 'chilled', ['eggs']],
    ]);
    expect(valid[1]).toMatchObject({ density_g_ml: 1.03, price: 4.99, supplier: 'Laticínios Bom Dia', taco: 'Leite, de vaca, integral' });
    expect(validateSuppliers(toRecords(parseCsv(csvOf(TEMPLATES.fornecedores)), SUPPLIER_COLUMNS).records).valid[0]).toMatchObject({ cnpj: '12345678000190' });
    const sh = validateSheets(toRecords(parseCsv(csvOf(TEMPLATES.fichas)), SHEET_COLUMNS).records);
    expect(sh.errors).toEqual([]);
    expect(sh.valid).toEqual([{ lines: [2, 3], name: 'Arroz branco', category: 'side', servings: 10, cooked_weight_g: 2200, items: [{ line: 2, ingredient: 'Arroz branco tipo 1', gross_g: 1000, fc: 1 }, { line: 3, ingredient: 'Óleo de soja', gross_g: 30, fc: null }] }]);
  });

  it('300 insumos com 10 inválidos: 290 entram e o relatório mostra as 10 linhas com o motivo', () => {
    const rows = [['Insumo', 'Unidade', 'Preço (R$)']];
    for (let i = 1; i <= 300; i++) rows.push([i % 60 === 0 ? '' : `Insumo ${i}`, i % 60 === 30 ? 'saco' : 'kg', 'R$ 1.234,50']);
    const { records, unknown } = toRecords(rows, INGREDIENT_COLUMNS);
    expect(unknown).toEqual([]); // "Preço (R$)" vira "preco_r", sinônimo de preço
    const r = validateIngredients(records);
    expect(r.valid).toHaveLength(290);
    expect(r.errors).toHaveLength(10);
    expect(r.errors[0]).toEqual({ line: 31, message: 'Unidade "saco" não reconhecida (use kg, g, L, mL, un, dz, cx ou pct).' });
    expect(r.errors[1]).toEqual({ line: 61, message: 'Nome do insumo ausente ou longo demais.' });
    expect(r.valid[0]!.price).toBe(1234.5);
  });

  it('erros por linha: repetido, número, peso da unidade, alergênico, coluna obrigatória', () => {
    const { records } = toRecords([['nome', 'unidade_compra', 'fc', 'alergenicos'], ['Ovo', 'un', '', ''], ['Arroz', 'kg', '0,5', ''], ['Feijão', 'kg', '', ''], ['Pão', 'kg', '', 'glúten | ervilha'], ['feijão', 'kg', '', '']], INGREDIENT_COLUMNS);
    const r = validateIngredients(records);
    expect(r.valid.map((v) => v.name)).toEqual(['Feijão']);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 5, 6]);
    expect(r.errors[2]!.message).toBe('Alergênico não reconhecido: ervilha.');
    expect(r.errors[3]!.message).toBe('"feijão" repetido na planilha.');
    expect(toRecords([['preco'], ['1']], INGREDIENT_COLUMNS).missing).toEqual(['nome']);
  });

  it('ficha com linha inválida não entra pela metade', () => {
    const r = validateSheets(toRecords([['ficha', 'insumo', 'peso_bruto_g'], ['Sopa', 'Batata', '500'], ['Sopa', 'Cenoura', 'x'], ['Suco', 'Laranja', '1000']], SHEET_COLUMNS).records);
    expect(r.valid.map((s) => s.name)).toEqual(['Suco']);
    expect(r.errors.map((e) => e.message)).toEqual(['A ficha "Sopa" tem linhas com erro e não será importada.', 'Peso bruto inválido para Cenoura.']);
  });
});
