import { expect, test } from '@playwright/test';

// U7 — APPCC: cria unidade e plano, adiciona etapas, usa o PCC de cocção sugerido, responde a árvore de um
// perigo, aprova, confere o fluxograma com o PCC 1 e baixa o PDF. No fim desativa a unidade.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('plano APPCC com PCC de cocção', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.skip(test.info().project.name !== 'desktop', 'Plano é montado no computador.');
  test.setTimeout(120_000);
  const stamp = Date.now();
  const unitName = `APPCC E2E ${stamp}`;

  await page.goto('/login?next=/app/uan');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app\/uan$/);
  await page.getByRole('button', { name: 'Nova unidade' }).click();
  const uf = page.getByRole('form', { name: 'Nova unidade' });
  await uf.getByLabel('Nome da unidade').fill(unitName);
  await uf.getByRole('button', { name: 'Criar unidade' }).click();
  await expect(page.getByRole('heading', { level: 1, name: unitName })).toBeVisible({ timeout: 15_000 });
  const unitUrl = new URL(page.url()).pathname;
  try {
    await page.getByRole('link', { name: 'APPCC', exact: true }).click();
    const nf = page.getByRole('form', { name: 'Novo plano APPCC' });
    await nf.getByLabel('Título').fill(`APPCC — Frango ${stamp}`);
    await nf.getByRole('button', { name: 'Criar plano' }).click();
    await expect(page.getByRole('heading', { level: 1, name: `APPCC — Frango ${stamp}` })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Etapa', exact: true }).click();
    await page.locator('#st-0-name').fill('Recebimento do frango');
    await page.getByRole('button', { name: 'Perigo', exact: true }).click();
    await page.locator('#hz-0-0-desc').fill('Multiplicação de bactérias por temperatura inadequada');
    const tree = page.getByRole('group', { name: /Existem medidas de controle/ });
    await tree.getByRole('button', { name: 'Sim' }).click();
    await page.getByRole('group', { name: /feita para eliminar/ }).getByRole('button', { name: 'Não' }).click();
    await page.getByRole('group', { name: /pode ocorrer ou aumentar/ }).getByRole('button', { name: 'Sim' }).click();
    await page.getByRole('group', { name: /etapa seguinte/ }).getByRole('button', { name: 'Sim' }).click();
    await expect(page.getByText('Resultado: Não é PCC')).toBeVisible();

    await page.getByRole('button', { name: 'Etapa', exact: true }).click();
    await page.locator('#st-1-name').fill('Cocção');
    await page.locator('#st-1-temp').fill('74');
    await page.getByRole('button', { name: /PCC de cocção \(74 °C\)/ }).click();
    await expect(page.locator('#hz-1-0-cl')).toHaveValue('Centro do alimento com no mínimo 74 °C');
    await expect(page.getByText('Pronto para aprovar.')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Aprovar plano' }).click();
    await expect(page.getByText(/^Aprovado em/)).toBeVisible({ timeout: 20_000 });
    const flow = page.getByRole('list', { name: 'Fluxograma' });
    await expect(flow).toContainText('2. Cocção');
    await expect(flow).toContainText('PCC 1');
    await expect(page.getByRole('button', { name: 'Salvar rascunho' })).toHaveCount(0);

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /PDF do plano/ }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^appcc-appcc-frango-\d+-v1\.pdf$/);
  } finally {
    await page.goto(unitUrl);
    const ue = page.getByRole('form', { name: 'Dados da unidade' });
    await ue.getByLabel(/Unidade ativa/).uncheck();
    await ue.getByRole('button', { name: 'Salvar unidade' }).click();
    await expect(ue.getByRole('status')).toHaveText('Unidade salva.', { timeout: 15_000 });
  }
});
