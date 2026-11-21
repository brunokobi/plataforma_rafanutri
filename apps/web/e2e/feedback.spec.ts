import { expect, test } from '@playwright/test';

// RN-047 — Feedback do beta: abre pelo cabeçalho, envia e confirma. Mensagem marcada "[e2e]" para filtrar.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('enviar feedback pelo cabeçalho', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  await page.goto('/login?next=/app/agenda');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app\/agenda$/);

  // Celular e tablet: o feedback fica na gaveta do menu lateral.
  const openMenu = page.getByRole('button', { name: 'Abrir menu' });
  if (await openMenu.isVisible()) await openMenu.click();
  await page.getByRole('button', { name: 'Enviar feedback' }).filter({ visible: true }).click();
  const form = page.getByRole('form', { name: 'Feedback' });
  await expect(form.getByText('(/app/agenda)')).toBeVisible();
  await form.getByRole('button', { name: 'Enviar' }).click();
  await expect(form.getByRole('status')).toHaveText('Escreva pelo menos 3 caracteres.');
  await form.getByRole('button', { name: 'Algo deu errado' }).click();
  await form.getByLabel('Mensagem').fill(`[e2e] teste automático ${test.info().project.name}`);
  await form.getByRole('button', { name: 'Enviar' }).click();
  await expect(form.getByRole('status')).toHaveText('Obrigado! Recebemos seu feedback.', { timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
