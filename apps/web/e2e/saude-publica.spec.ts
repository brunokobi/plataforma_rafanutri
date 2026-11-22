import { expect, test } from '@playwright/test';

// Saúde pública, bloco A — triagem MUST com IMC e perda de peso das avaliações, histórico e painel de risco.
// Contra o ambiente real com o usuário de teste (consultório com o módulo public_health). Cria um paciente e arquiva no fim.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('triagem nutricional e painel de risco', async ({ page }, info) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD.');
  test.skip(info.project.name !== 'desktop', 'Fluxo de cadastro roda só no desktop.');
  test.setTimeout(120_000);
  const name = `Triagem E2E ${Date.now()}`;
  let patientUrl = '';
  try {
    await page.goto('/login?next=/app/pacientes');
    await page.getByLabel('E-mail').fill(email!);
    await page.getByLabel('Senha', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/app\/pacientes$/);
    await page.getByRole('button', { name: /Novo paciente/ }).click();
    const form = page.getByRole('form', { name: 'Novo paciente' });
    await form.getByLabel('Nome completo').fill(name);
    await form.getByLabel('Data de nascimento (opcional)').fill('1950-05-10');
    await form.getByRole('button', { name: 'Salvar paciente' }).click();
    await page.getByRole('link', { name }).first().click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    patientUrl = page.url();

    await page.getByRole('navigation', { name: 'Seções do paciente' }).getByRole('link', { name: 'Triagens' }).click();
    await expect(page).toHaveURL(/\/triagens$/);
    await page.getByLabel('Passo 1 — IMC (kg/m²)').fill('19');
    await page.getByLabel(/Passo 2/).fill('7');
    await expect(page.getByRole('status', { name: 'Resultado' })).toContainText('Risco alto');
    await page.getByRole('button', { name: 'Salvar triagem' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Triagem registrada.' })).toBeVisible();
    const history = page.getByRole('list', { name: 'Triagens do paciente' });
    await expect(history.getByRole('listitem')).toHaveCount(1);
    await expect(history).toContainText('MUST');

    await page.getByRole('link', { name: 'Saúde pública' }).first().click();
    await expect(page).toHaveURL(/\/app\/saude-publica$/);
    await page.getByRole('navigation', { name: 'Filtrar por risco' }).getByRole('link', { name: 'Alto' }).click();
    await expect(page.getByRole('list', { name: 'Pacientes em risco' }).getByRole('link', { name })).toBeVisible();
  } finally {
    if (patientUrl) {
      await page.goto(patientUrl);
      await page.getByRole('button', { name: 'Arquivar' }).click();
      await expect(page.getByRole('button', { name: 'Reativar' })).toBeVisible();
    }
  }
});
