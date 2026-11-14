import { expect, test } from '@playwright/test';

// RN-010 — Consulta à TACO: busca sem acento, filtro por grupo e ficha com todos os nutrientes. Só leitura.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('consulta à tabela TACO', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  await page.goto('/login?next=/app/alimentos/taco');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app\/alimentos\/taco$/);

  await page.getByLabel('Alimento').fill('feijao carioca cozido');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Feijão, carioca, cozido' }) });
  await expect(row).toContainText('76');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await row.getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Feijão, carioca, cozido' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Ferro/ })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(30); // cabeçalho + 29 nutrientes
  await expect(page.getByText(/NEPA/)).toBeVisible();

  await page.getByRole('link', { name: /Leguminosas e derivados/ }).click();
  await expect(page.getByLabel('Grupo')).toHaveValue('Leguminosas e derivados');
  expect(await page.getByRole('row').count()).toBeGreaterThan(20);
});
