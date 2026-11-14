import { expect, test } from '@playwright/test';

// RN-204 — Marca do consultório: o owner envia o logo, que passa a ser servido pela rota privada, e remove.
// Roda contra o ambiente real com o usuário de teste (owner do consultório de teste); deixa sem logo no fim.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
// PNG 8×8 vermelho
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YGCAFTEMLQkARmxIAeJ265UAAAAASUVORK5CYII=';

test('logo do consultório', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  page.on('dialog', (d) => void d.accept());
  await page.goto('/login?next=/app/configuracoes/consultorio');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/configuracoes\/consultorio$/);
  await expect(page.getByRole('heading', { name: 'Marca do consultório' })).toBeVisible();

  await page.getByLabel('Logo', { exact: true }).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await expect(page.getByRole('status').filter({ hasText: 'Logo salvo.' })).toBeVisible({ timeout: 15_000 });
  const src = await page.getByRole('img', { name: 'Logo do consultório' }).getAttribute('src');
  await page.reload();
  const img = page.getByRole('img', { name: 'Logo do consultório' });
  await expect(img).toHaveAttribute('src', /^\/api\/consultorio\/[0-9a-f-]{36}\/logo/);
  const served = await page.request.get((await img.getAttribute('src'))!);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toMatch(/^image\/png/);
  expect(src).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Logo removido.' })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('img', { name: 'Logo do consultório' })).toHaveCount(0);
});
