import { expect, test } from '@playwright/test';

// RN-121 a RN-123 — UAN: o owner (consultório de teste com o módulo habilitado e contrato de 2 unidades)
// cria uma unidade, vê o alerta do alvará vencendo e a desativa no fim (para liberar a vaga do contrato).
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('unidade produtora da UAN', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  await page.goto('/login?next=/app');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app$/);

  await page.getByRole('link', { name: /UAN e Qualidade/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'UAN e Qualidade' })).toBeVisible();
  await page.getByRole('button', { name: 'Nova unidade' }).click();
  const form = page.getByRole('form', { name: 'Nova unidade' });
  const name = `Unidade E2E ${test.info().project.name} ${Date.now()}`;
  const expires = new Date(Date.now() - 3 * 3600e3 + 10 * 86400e3).toISOString().slice(0, 10);
  await form.getByLabel('Nome da unidade').fill(name);
  await form.getByLabel('Tipo').selectOption({ label: 'Cozinha industrial' });
  await form.getByLabel('CNPJ (opcional)').fill('12.345.678/0001-90');
  await form.getByLabel('Cidade').fill('Vitória');
  await form.getByLabel('UF').fill('es');
  await form.getByLabel('Validade').fill(expires);
  await form.getByLabel('Latitude').fill('-20.3155');
  await form.getByRole('button', { name: 'Criar unidade' }).click();
  await expect(form.getByText('Informe latitude e longitude juntas.')).toBeVisible();
  await form.getByLabel('Longitude').fill('-40.3128');
  await form.getByRole('button', { name: 'Criar unidade' }).click();

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Cozinha industrial · CNPJ 12.345.678/0001-90')).toBeVisible();
  await expect(page.getByText(/Alvará vence em 10 dia\(s\)/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const edit = page.getByRole('form', { name: 'Dados da unidade' });
  await expect(edit.getByLabel('UF')).toHaveValue('ES');
  await edit.getByLabel(/Unidade ativa/).uncheck();
  await edit.getByRole('button', { name: 'Salvar unidade' }).click();
  await expect(edit.getByRole('status')).toHaveText('Unidade salva.', { timeout: 15_000 });

  await page.getByRole('link', { name: '← Unidades' }).click();
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByText('Inativa')).toBeVisible();
});
