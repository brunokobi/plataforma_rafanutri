import { expect, test } from '@playwright/test';

// RN-056 — Funil do CRM contra o ambiente real: lead novo → em contato → perdido (com motivo); outro lead vira paciente
// (o paciente de teste é arquivado no fim). Retornos e indicadores abrem.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('funil do CRM', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.setTimeout(120_000);
  page.on('dialog', (d) => void (d.type() === 'prompt' ? d.accept('Achou caro') : d.accept()));
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const lost = `Lead E2E ${stamp}`;
  const convert = `Lead Paciente E2E ${stamp}`;
  let patientUrl = '';

  await page.goto('/login?next=/app/crm');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/crm$/);

  try {
    for (const name of [lost, convert]) {
      await page.getByRole('button', { name: 'Novo lead' }).click();
      const form = page.getByRole('form', { name: 'Novo lead' });
      await form.getByLabel('Nome').fill(name);
      await form.getByLabel('Telefone (opcional)').fill('(31) 99999-0000');
      await form.getByLabel('Origem').selectOption('instagram');
      await form.getByRole('button', { name: 'Salvar lead' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Lead ${name} cadastrado.` })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Lead novo' }).getByRole('listitem', { name })).toBeVisible();
    }

    await page.getByRole('combobox', { name: `Mover ${lost} para` }).selectOption('contacted');
    await expect(page.getByRole('region', { name: 'Em contato' }).getByRole('listitem', { name: lost })).toBeVisible();
    await page.getByRole('combobox', { name: `Mover ${lost} para` }).selectOption('lost');
    const lostCard = page.getByRole('region', { name: 'Perdido' }).getByRole('listitem', { name: lost });
    await expect(lostCard).toContainText('Achou caro');

    await page.getByRole('button', { name: `Cadastrar ${convert} como paciente` }).click();
    await expect(page).toHaveURL(/\/app\/pacientes\/[0-9a-f-]{36}$/);
    patientUrl = page.url();
    await expect(page.getByRole('heading', { level: 1, name: convert })).toBeVisible();

    await page.goto('/app/crm?aba=retornos');
    await expect(page.getByRole('navigation', { name: 'Filtrar retornos' })).toBeVisible();
    await page.goto('/app/crm?aba=indicadores&dias=30');
    await expect(page.getByText('Conversão lead → 1ª consulta')).toBeVisible();
    await expect(page.getByRole('table').getByText('Instagram')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // RN-064: indicadores no painel do módulo Clínico
    await page.goto('/app/clinico');
    await expect(page.getByRole('heading', { name: /^Indicadores de / })).toBeVisible();
    for (const label of ['Faturamento do mês', 'A receber', 'Ticket médio', 'Consultas realizadas', 'Taxa de faltas', 'Novos pacientes', 'Retornos atrasados']) {
      await expect(page.getByRole('group', { name: label })).toBeVisible();
    }
  } finally {
    if (patientUrl) {
      await page.goto(patientUrl);
      await page.getByRole('button', { name: 'Arquivar' }).click();
      await expect(page.getByRole('button', { name: 'Reativar' })).toBeVisible();
    }
  }
});
