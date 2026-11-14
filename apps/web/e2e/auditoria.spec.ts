import { expect, test } from '@playwright/test';

// RN-009 — Auditoria: o owner do consultório de teste vê os registros e filtra por tipo e ação.
// O logo enviado e removido no teste do consultório (e qualquer outra escrita) já gera linhas; aqui só se lê.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('auditoria do consultório', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  await page.goto('/login?next=/app/configuracoes/auditoria');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app\/configuracoes\/auditoria$/);
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.getByRole('row').count()).toBeGreaterThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByLabel('Tipo').selectOption('patients');
  await page.getByLabel('Ação').selectOption('insert');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/entity=patients&action=insert|action=insert.*entity=patients/);
  const rows = page.getByRole('row');
  if ((await rows.count()) > 1) {
    await expect(rows.nth(1)).toContainText('Criou · Paciente');
  } else {
    await expect(page.getByText('Nenhum registro com esses filtros.')).toBeVisible();
  }
  await page.getByRole('link', { name: 'Limpar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app\/configuracoes\/auditoria$/);
});
