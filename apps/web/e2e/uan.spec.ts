import { expect, test } from '@playwright/test';

// RN-121 a RN-123 — UAN: o owner (consultório de teste com o módulo habilitado e contrato de 2 unidades)
// cria uma unidade, vê o alerta do alvará vencendo, convida um cozinheiro por link (RN-220) e a desativa
// no fim (para liberar a vaga do contrato). A conta da equipe é fixa por projeto (@example.com, sem dados):
// na primeira execução é criada pelo convite; nas seguintes, entra com ela e aceita.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('unidade produtora da UAN e convite da equipe', async ({ page, browser }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.setTimeout(120_000);
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

  // RN-220: convite do cozinheiro por link
  const invite = page.getByRole('form', { name: 'Convidar para a equipe' });
  await expect(invite.getByLabel('Papel')).toHaveValue('cook');
  await invite.getByLabel('Para quem (opcional)').fill('Equipe E2E');
  await invite.getByRole('button', { name: 'Gerar link' }).click();
  const link = await page.getByLabel('Link do convite').inputValue({ timeout: 15_000 });
  expect(link).toMatch(/\/uan\/convite\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole('list', { name: 'Convites pendentes' }).getByText(/Cozinheiro\(a\) · Equipe E2E/)).toBeVisible();

  const staffEmail = `e2e-equipe-${test.info().project.name}@example.com`;
  const staffPassword = 'Equipe-E2E-2026!';
  const staffCtx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: page.viewportSize() });
  try {
    const staff = await staffCtx.newPage();
    await staff.goto(new URL(link).pathname);
    await expect(staff.getByRole('heading', { level: 1, name: 'Você foi convidado(a) para a equipe' })).toBeVisible();
    await expect(staff.getByText(name)).toBeVisible();
    await expect(staff.getByLabel('Seu nome')).toHaveValue('Equipe E2E');
    await staff.getByLabel('E-mail').fill(staffEmail);
    await staff.getByLabel('Crie uma senha').fill(staffPassword);
    await staff.getByLabel('Repita a senha').fill(staffPassword);
    await staff.getByRole('button', { name: 'Criar acesso e entrar' }).click();
    const unitUrl = /\/app\/uan\/unidades\/[0-9a-f-]{36}$/;
    const exists = staff.getByRole('alert').filter({ hasText: 'Já existe uma conta' });
    await expect(staff.getByRole('heading', { level: 1, name }).or(exists)).toBeVisible({ timeout: 20_000 });
    if (await exists.isVisible()) {
      await exists.getByRole('link', { name: 'Entrar' }).click();
      await expect(staff).toHaveURL(/\/login\?next=%2Fuan%2Fconvite%2F/);
      await expect(staff.getByRole('button', { name: 'Entrar' })).toBeVisible();
      await staff.getByLabel('E-mail').fill(staffEmail);
      await staff.getByLabel('Senha', { exact: true }).fill(staffPassword);
      await staff.getByRole('button', { name: 'Entrar' }).click();
      await staff.getByRole('button', { name: 'Aceitar convite' }).click({ timeout: 20_000 });
    }
    await expect(staff).toHaveURL(unitUrl, { timeout: 20_000 });
    await expect(staff.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(staff.getByText('Cozinheiro(a)')).toBeVisible();
    await expect(staff.getByRole('heading', { name: 'Equipe' })).toHaveCount(0);
    // Só da equipe UAN: o início leva ao módulo UAN, não ao onboarding do consultório
    await staff.goto('/app');
    await expect(staff).toHaveURL(/\/app\/uan$/, { timeout: 15_000 });
    expect(await staff.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally {
    await staffCtx.close();
  }

  // owner vê o cozinheiro na equipe e o remove
  await page.reload();
  const members = page.getByRole('list', { name: 'Membros da equipe' });
  await expect(members.getByText('Equipe E2E')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await members.getByRole('button', { name: 'Remover Equipe E2E da equipe' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Equipe E2E saiu da equipe.' })).toBeVisible({ timeout: 15_000 });

  // RN-147/150: personalizar o modelo da biblioteca, editar itens e agendar
  await page.getByRole('button', { name: 'Personalizar Abertura da cozinha' }).click();
  await expect(page).toHaveURL(/\/app\/uan\/modelos\/[0-9a-f-]{36}\?unidade=/, { timeout: 15_000 });
  const editor = page.getByRole('form', { name: 'Editar modelo' });
  await expect(editor.getByLabel('Nome do modelo')).toHaveValue('Abertura da cozinha — personalizado');
  await editor.getByLabel('Pergunta do item 1').fill('Piso e bancadas limpos e sem resíduos?');
  await editor.getByRole('button', { name: 'Adicionar item' }).click();
  await editor.getByLabel('Pergunta do item 10').fill('Termômetro de espeto calibrado?');
  await editor.getByLabel('Crítico (exige foto e abre não conformidade)').last().check();
  await editor.getByRole('button', { name: 'Salvar modelo' }).click();
  await expect(editor.getByRole('status')).toContainText('Modelo salvo', { timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole('form', { name: 'Editar modelo' }).getByLabel('Pergunta do item 10')).toHaveValue('Termômetro de espeto calibrado?');
  await page.getByRole('link', { name: '← Voltar' }).click();

  const sched = page.getByRole('form', { name: 'Agendar checklist' });
  await sched.getByLabel('Checklist').selectOption({ label: 'Abertura da cozinha — personalizado' });
  await sched.getByLabel('sáb', { exact: true }).check();
  await sched.getByLabel('dom', { exact: true }).check();
  await sched.getByLabel('Horário', { exact: true }).fill('00:01');
  await sched.getByLabel('Tolerância (min)').fill('15');
  await sched.getByRole('button', { name: 'Agendar' }).click();
  await expect(page.getByRole('list', { name: 'Checklists agendados' }).getByText(/Abertura da cozinha — personalizado · todos os dias às 00:01/)).toBeVisible({ timeout: 15_000 });
  const todayItem = page.getByRole('list', { name: 'Checklists de hoje' }).getByRole('listitem').filter({ hasText: 'Abertura da cozinha — personalizado' });
  await expect(todayItem.getByText('Atrasado', { exact: true })).toBeVisible();
  await expect(todayItem.getByRole('button', { name: 'Iniciar Abertura da cozinha — personalizado' })).toBeVisible();
  // Remove da agenda e tira o modelo de uso (não acumula cópias na empresa de teste)
  await page.getByRole('button', { name: 'Remover Abertura da cozinha — personalizado da agenda' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Removido da agenda.' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('list', { name: 'Modelos de checklist' }).getByRole('listitem').filter({ hasText: 'Abertura da cozinha — personalizado' }).getByRole('link', { name: 'Editar' }).click();
  const editor2 = page.getByRole('form', { name: 'Editar modelo' });
  await editor2.getByLabel('Modelo em uso (aparece para a equipe)').uncheck();
  await editor2.getByRole('button', { name: 'Salvar modelo' }).click();
  await expect(editor2.getByRole('status')).toContainText('Modelo salvo', { timeout: 15_000 });
  await page.getByRole('link', { name: '← Voltar' }).click();

  const edit = page.getByRole('form', { name: 'Dados da unidade' });
  await expect(edit.getByLabel('UF')).toHaveValue('ES');
  await edit.getByLabel(/Unidade ativa/).uncheck();
  await edit.getByRole('button', { name: 'Salvar unidade' }).click();
  await expect(edit.getByRole('status')).toHaveText('Unidade salva.', { timeout: 15_000 });

  await page.getByRole('link', { name: '← Unidades' }).click();
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card.getByText('Inativa')).toBeVisible();
});
