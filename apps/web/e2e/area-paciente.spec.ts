import { expect, test, type Page } from '@playwright/test';

// RN-203/RN-204 — Convite do paciente → criação do acesso → área do paciente → revogação, contra o ambiente
// real com o usuário de teste. Cria um paciente e uma conta de paciente (@example.com) por execução; o
// paciente é arquivado no fim. Contas de paciente de teste: ver db/README (limpeza).
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

async function login(page: Page) {
  await page.goto('/login?next=/app/pacientes');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/pacientes$/);
}

test('convite e área do paciente', async ({ page, browser }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.setTimeout(180_000);
  page.on('dialog', (d) => void d.accept());
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const name = `Paciente App E2E ${stamp}`;
  const patientEmail = `e2e.paciente.${stamp}@example.com`;
  let patientUrl = '';

  try {
    await test.step('nutricionista cadastra e convida', async () => {
      await login(page);
      await page.getByRole('button', { name: /Novo paciente/ }).click();
      const form = page.getByRole('form', { name: 'Novo paciente' });
      await form.getByLabel('Nome completo').fill(name);
      await form.getByLabel('E-mail (opcional)').fill(patientEmail);
      await form.getByRole('button', { name: 'Salvar paciente' }).click();
      await page.getByRole('link', { name }).first().click();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      patientUrl = page.url();
      // E-mail longo não pode criar rolagem horizontal na ficha (celular)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      const card = page.getByRole('region', { name: 'Área do paciente' });
      await expect(card.getByText('Sem acesso')).toBeVisible();
      await card.getByRole('button', { name: 'Convidar para a área do paciente' }).click();
      await expect(card.getByLabel(/E-mail de acesso/)).toHaveValue(patientEmail);
      await card.getByRole('button', { name: /Gerar link/ }).click();
      await expect(card.getByLabel('Link do convite')).toHaveValue(/\/p\/convite\/[A-Za-z0-9_-]{43}$/);
    });

    const link = await page.getByLabel('Link do convite').inputValue();
    const patientCtx = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'pt-BR', reducedMotion: 'reduce' });
    const pp = await patientCtx.newPage();
    const pwd = `Senha-${stamp}`;

    await test.step('paciente cria o acesso pelo link', async () => {
      await pp.goto(link);
      await expect(pp.getByRole('heading', { level: 1, name: 'Olá, Paciente!' })).toBeVisible();
      await expect(pp.getByLabel('E-mail de acesso')).toHaveValue(patientEmail);
      await pp.waitForLoadState('networkidle');
      await pp.getByLabel('Crie uma senha').fill(pwd);
      await pp.getByLabel('Repita a senha').fill(pwd);
      await pp.getByRole('button', { name: /Criar acesso/ }).click();
      await expect(pp).toHaveURL(/\/p$/);
      await expect(pp.getByRole('heading', { level: 1, name: 'Olá, Paciente!' })).toBeVisible();
      await expect(pp.getByText('Seu plano ainda não foi publicado')).toBeVisible();
      // 360 px sem rolagem horizontal
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    await test.step('nutricionista publica um plano; paciente vê o plano completo (RN-205)', async () => {
      await page.goto(`${patientUrl}/planos`);
      await page.getByRole('button', { name: 'Novo plano' }).click();
      await expect(page).toHaveURL(/\/planos\/[0-9a-f-]{36}$/);
      const meal = page.locator('section[aria-labelledby^="meal-"]').first();
      await meal.getByLabel('Buscar alimento').fill('arroz');
      await meal.getByRole('option').first().click();
      await meal.getByRole('button', { name: /Substituições/ }).first().click();
      await meal.getByRole('button', { name: 'Adicionar' }).first().click();
      await expect(meal.getByRole('button', { name: /Substituições \(1\)/ })).toBeVisible();
      await page.getByLabel(/Orientações para o paciente/).fill('Beba 2 litros de água por dia.');
      await page.getByRole('button', { name: 'Salvar rascunho' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo.' })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Publicar para o paciente' }).click();
      await expect(page.getByRole('button', { name: 'Publicado' })).toBeVisible();

      await pp.goto('/p');
      await pp.getByRole('link', { name: 'Ver plano completo' }).click();
      await expect(pp).toHaveURL(/\/p\/plano/);
      const first = pp.locator('section[id^="refeicao-"]').first();
      await expect(first.getByText(/Arroz/i).first()).toBeVisible();
      await first.getByText(/Pode trocar por \(1\)/).click();
      await expect(first.locator('details[open] li').first()).toBeVisible();
      await expect(pp.getByText('Beba 2 litros de água por dia.')).toBeVisible();
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    await test.step('link usado não abre de novo; paciente não entra no painel do nutricionista', async () => {
      await pp.goto(link);
      await expect(pp.getByText('Convite indisponível')).toBeVisible();
      await pp.goto('/app/pacientes');
      await expect(pp).toHaveURL(/\/p$/);
    });

    await test.step('nutricionista vê o acesso ativo e revoga', async () => {
      await page.goto(patientUrl);
      const card = page.getByRole('region', { name: 'Área do paciente' });
      await expect(card.getByText('Acesso ativo')).toBeVisible();
      await card.getByRole('button', { name: 'Revogar acesso' }).click();
      await expect(card.getByText('Sem acesso')).toBeVisible();
      await pp.goto('/p');
      await expect(pp.getByText(/não está ligada a nenhum nutricionista/)).toBeVisible();
    });
    await patientCtx.close();
  } finally {
    if (patientUrl) {
      await page.goto(patientUrl);
      await page.getByRole('button', { name: 'Arquivar' }).click();
      await expect(page.getByRole('button', { name: 'Reativar' })).toBeVisible();
    }
  }
});
