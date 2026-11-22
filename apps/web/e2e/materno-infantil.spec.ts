import { expect, test, type Page } from '@playwright/test';

// RN-114 a RN-118 — Criança menor: responsável com consentimento, convite do app ao responsável, introdução
// alimentar pelo nutricionista e pelo responsável (reação moderada em destaque na ficha). Contra o ambiente real,
// com o usuário de teste (plano com o módulo materno-infantil). Cria um paciente e uma conta @example.com; arquiva no fim.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

async function login(page: Page) {
  await page.goto('/login?next=/app/pacientes');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/pacientes$/);
}

test('materno-infantil: responsável, app da família e introdução alimentar', async ({ page, browser }, info) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.skip(info.project.name !== 'desktop', 'Fluxo longo: roda só no desktop; o app da família é aberto em 360 px.');
  test.setTimeout(180_000);
  page.on('dialog', (d) => void d.accept());
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const name = `Bebê E2E ${stamp}`;
  const guardianEmail = `e2e.responsavel.${stamp}@example.com`;
  const birth = new Date(Date.now() - 210 * 864e5).toISOString().slice(0, 10);
  let patientUrl = '';

  try {
    await test.step('menor sem responsável não recebe convite; cadastro do responsável com consentimento', async () => {
      await login(page);
      await page.getByRole('button', { name: /Novo paciente/ }).click();
      const form = page.getByRole('form', { name: 'Novo paciente' });
      await form.getByLabel('Nome completo').fill(name);
      await form.getByLabel('Data de nascimento (opcional)').fill(birth);
      await form.getByLabel('Sexo (opcional)').selectOption('female');
      await form.getByRole('button', { name: 'Salvar paciente' }).click();
      await page.getByRole('link', { name }).first().click();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      patientUrl = page.url();

      const card = page.getByRole('region', { name: 'Área do paciente' });
      await expect(card.getByText(/menor de idade: o app é liberado para um responsável/)).toBeVisible();
      await expect(card.getByRole('button', { name: 'Convidar para a área do paciente' })).toHaveCount(0);
      const guardians = card.getByRole('region', { name: 'Responsáveis legais' });
      await expect(guardians.getByText('Sem consentimento')).toBeVisible();
      await guardians.getByRole('button', { name: 'Cadastrar responsável' }).click();
      const g = guardians.getByRole('form', { name: 'Cadastrar responsável' });
      await g.getByLabel('Nome').fill('Responsável E2E');
      await g.getByLabel('Parentesco').selectOption('mother');
      await g.getByLabel('E-mail (para o app)').fill(guardianEmail);
      await g.getByRole('checkbox', { name: /consentiu/ }).check();
      await g.getByRole('button', { name: 'Salvar' }).click();
      await expect(guardians.getByText('Consentimento registrado')).toBeVisible();

      await card.getByRole('button', { name: 'Convidar para a área do paciente' }).click();
      await expect(card.getByLabel('Responsável', { exact: true })).toContainText('Responsável E2E');
      await expect(card.getByLabel('E-mail do responsável')).toHaveValue(guardianEmail);
      await card.getByLabel('Enviar o convite agora').uncheck();
      await card.getByRole('button', { name: /Gerar link/ }).click();
      await expect(card.getByLabel('Link do convite')).toHaveValue(/\/p\/convite\/[A-Za-z0-9_-]{43}$/);

      const share = page.getByRole('form', { name: 'O que o paciente vê' });
      await share.getByRole('switch', { name: /Materno-infantil/ }).check();
      await share.getByRole('button', { name: 'Salvar' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Salvo.' })).toBeVisible();
    });
    const link = await page.getByLabel('Link do convite').inputValue();

    await test.step('nutricionista registra medida e ovo sem reação', async () => {
      await page.goto(`${patientUrl}/materno-infantil`);
      const measure = page.getByRole('form', { name: 'Nova medida' });
      await measure.getByLabel('Peso (kg)').fill('7,4');
      await measure.getByLabel('Comprimento (cm)').fill('66');
      await measure.getByRole('button', { name: 'Salvar medida' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Medida registrada.' })).toBeVisible();
      const allergens = page.getByRole('region', { name: 'Alergênicos' });
      await allergens.getByRole('button', { name: 'Registrar Ovo' }).click();
      await allergens.getByRole('button', { name: 'Salvar' }).click();
      await expect(allergens.getByText('Sem reação')).toBeVisible();
    });

    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'pt-BR', reducedMotion: 'reduce' });
    const pp = await ctx.newPage();
    await test.step('responsável cria o acesso e registra amendoim com reação moderada', async () => {
      const pwd = `Senha-${stamp}`;
      await pp.goto(link);
      await expect(pp.getByLabel('E-mail de acesso')).toHaveValue(guardianEmail);
      await pp.waitForLoadState('networkidle');
      await pp.getByLabel('Crie uma senha').fill(pwd);
      await pp.getByLabel('Repita a senha').fill(pwd);
      await pp.getByRole('checkbox', { name: /Li e aceito os Termos de Uso/ }).check();
      await pp.getByRole('button', { name: /Criar acesso/ }).click();
      await expect(pp).toHaveURL(/\/p$/);
      await pp.getByRole('link', { name: /Acompanhamento/ }).click();
      await expect(pp.getByRole('heading', { name: 'Crescimento' })).toBeVisible();
      await expect(pp.getByText(/adequad/).first()).toBeVisible();
      await expect(pp.getByText(/escore/i)).toHaveCount(0);
      const allergens = pp.getByRole('region', { name: 'Alimentos que podem causar alergia' });
      await expect(allergens.getByText('Sem reação')).toBeVisible();
      await allergens.getByRole('button', { name: 'Registrar Amendoim' }).click();
      await allergens.getByLabel('Reação').selectOption('moderate');
      await expect(allergens.getByText(/Seu nutricionista será avisado/)).toBeVisible();
      await allergens.getByRole('button', { name: 'Salvar' }).click();
      await expect(allergens.getByText('Reação moderada')).toBeVisible();
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    await test.step('ficha destaca a reação registrada pelo responsável', async () => {
      await page.goto(`${patientUrl}/materno-infantil`);
      await expect(page.getByRole('alert').filter({ hasText: /Amendoim: reação moderada .*registrada pelo responsável/ })).toBeVisible();
    });

    await test.step('consentimento retirado: o responsável perde o app do menor', async () => {
      await page.goto(patientUrl);
      const guardians = page.getByRole('region', { name: 'Responsáveis legais' });
      await guardians.getByRole('button', { name: 'Retirar consentimento' }).click();
      await expect(guardians.getByText('Sem consentimento')).toBeVisible();
      await pp.goto('/p');
      await expect(pp.getByText(/não está ligada a nenhum nutricionista/)).toBeVisible();
    });
    await ctx.close();
  } finally {
    if (patientUrl) {
      await page.goto(patientUrl);
      await page.getByRole('button', { name: 'Arquivar' }).click();
      await expect(page.getByRole('button', { name: 'Reativar' })).toBeVisible();
    }
  }
});
