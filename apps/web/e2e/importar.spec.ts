import { expect, test } from '@playwright/test';

// RN-169 — Importação por planilha: fornecedores (uma linha boa e uma inválida, relatório) e prévia de insumos
// com a sugestão da TACO. No fim o fornecedor importado sai de uso.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('importar fornecedores e prévia de insumos', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.skip(test.info().project.name !== 'desktop', 'Implantação é feita no computador.');
  test.setTimeout(120_000);
  const stamp = Date.now();
  const supplier = `Fornecedor Importado E2E ${stamp}`;

  await page.goto('/login?next=/app/uan/importar');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Importar planilhas' })).toBeVisible({ timeout: 20_000 });

  // modelo para download
  const [tpl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar modelo' }).click()]);
  expect(tpl.suggestedFilename()).toBe('modelo-fornecedores.csv');

  const csv = `﻿nome;cnpj;contato\n${supplier};12.345.678/0001-90;Ana\nX;123;\n`;
  await page.getByLabel('Planilha CSV').setInputFiles({ name: 'fornecedores.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('status').filter({ hasText: 'pronta(s) para importar' })).toContainText('1 linha(s) pronta(s) para importar · 1 com erro');
  await expect(page.getByRole('list', { name: 'Erros da planilha' })).toContainText('Linha 3: Nome do fornecedor ausente ou longo demais.');
  await page.getByRole('button', { name: 'Importar 1 linha(s)' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'importada(s)' })).toContainText('1 importada(s) · 0 já existiam · 1 com erro', { timeout: 20_000 });
  const [rep] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar relatório' }).click()]);
  expect(rep.suggestedFilename()).toBe('relatorio-importacao-fornecedores.csv');

  // insumos: só a prévia (sugestão da TACO pelo nome)
  await page.getByRole('button', { name: 'Insumos', exact: true }).click();
  await page.getByLabel('Planilha CSV').setInputFiles({ name: 'insumos.csv', mimeType: 'text/csv', buffer: Buffer.from('nome;unidade_compra;preco\nArroz tipo 1 cru;kg;5,49\n') });
  await expect(page.getByRole('table', { name: 'Insumos a importar' })).toContainText(/sugerido: Arroz/i, { timeout: 20_000 });

  // limpeza: fornecedor fora de uso
  await page.goto('/app/uan/fornecedores');
  await page.getByRole('list', { name: 'Fornecedores' }).getByRole('listitem').filter({ hasText: supplier }).getByRole('button', { name: `Editar ${supplier}` }).click();
  const se = page.getByRole('form', { name: `Dados de ${supplier}` });
  await se.getByLabel('Fornecedor ativo').uncheck();
  await se.getByRole('button', { name: 'Salvar fornecedor' }).click();
  await expect(page.getByRole('list', { name: 'Fornecedores' }).getByRole('listitem').filter({ hasText: supplier }).getByText('Inativo')).toBeVisible({ timeout: 15_000 });
});
