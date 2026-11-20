import { expect, test } from '@playwright/test';

// Documentos legais: páginas públicas com a versão vigente; a conta pede o aceite uma vez por versão
// (este teste aceita pela conta de teste quando o aviso aparecer). Roda antes dos outros (nome "00-").
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('páginas dos termos e da privacidade', async ({ page }) => {
  for (const [path, title] of [['/termos', 'Termos de Uso para Profissionais'], ['/termos/paciente', 'Termos de Uso para Pacientes'], ['/privacidade', 'Política de Privacidade']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(/Versão vigente desde \d+ de \w+ de \d{4}/)).toBeVisible();
  }
  await expect(page.getByText(/dados pessoais sensíveis|controlador/).first()).toBeVisible();
});

test('aceite dos termos pela conta profissional', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD.');
  test.skip(test.info().project.name !== 'desktop', 'Uma vez basta.');
  await page.goto('/login?next=/app');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  const dialog = page.getByRole('dialog', { name: /Antes de continuar|Atualizamos nossos documentos/ });
  if (await dialog.isVisible().catch(() => false)) {
    await expect(dialog.getByRole('link', { name: 'Termos de Uso para Profissionais' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Aceitar e continuar' })).toBeDisabled();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Aceitar e continuar' }).click();
  }
  await expect(page.getByRole('dialog', { name: /Antes de continuar|Atualizamos/ })).toHaveCount(0, { timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('dialog', { name: /Antes de continuar|Atualizamos/ })).toHaveCount(0);
});
