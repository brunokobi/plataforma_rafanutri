import { expect, test } from '@playwright/test';

// Administração da plataforma: conta comum (a de teste) não acessa — a página não existe para ela.
// O caminho do admin é coberto pelo teste de isolamento (conta temporária em platform_admins).
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('conta comum não vê a administração', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD.');
  test.skip(test.info().project.name !== 'desktop', 'Uma vez basta.');
  await page.goto('/login?next=/app/admin');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('list', { name: 'Empresas' })).toHaveCount(0);
});
