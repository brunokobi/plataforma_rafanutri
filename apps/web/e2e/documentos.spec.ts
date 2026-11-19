import { expect, test } from '@playwright/test';

// U6a — Documentos de BPF e treinamentos: cria uma unidade, gera o POP de água a partir do modelo (com o nome da
// unidade), aprova, dá ciência, abre nova versão e registra um treinamento. No fim desativa a unidade.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('POP do modelo, aprovação, ciência e treinamento', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.skip(test.info().project.name !== 'desktop', 'Cadastro é feito no computador.');
  test.setTimeout(120_000);
  const stamp = Date.now();
  const unitName = `Documentos E2E ${stamp}`;

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
    await page.getByRole('link', { name: 'Documentos', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Documentos de Boas Práticas' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^Criar POP 2/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: /POP 2/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#doc-body')).toHaveValue(new RegExp(unitName));

    await page.getByRole('tab', { name: 'Pré-visualizar' }).click();
    await expect(page.getByRole('heading', { name: 'Objetivo', exact: true })).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Aprovar versão' }).click();
    await expect(page.getByRole('heading', { name: 'Versão vigente: 1' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Integridade \(SHA-256\)/)).toBeVisible();
    await page.getByRole('button', { name: 'Li e estou ciente' }).click();
    await expect(page.getByText('Você já deu ciência desta versão.')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Editar (nova versão)' }).click();
    await page.locator('#doc-body').fill(`# POP de água\n\nRevisado em ${stamp}.`);
    await page.getByLabel('O que mudou').fill('Texto revisado');
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(page.getByRole('heading', { name: 'Rascunho da versão 2' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Versão vigente: 1' })).toBeVisible();

    await page.goto(`${unitUrl}/treinamentos`);
    const f = page.getByRole('form', { name: 'Registrar treinamento' });
    await f.getByLabel('Tema').fill('Boas práticas de manipulação');
    await f.getByLabel('Carga horária (h)').fill('2,5');
    await f.getByLabel(/Outros participantes/).fill(`Pessoa ${stamp}`);
    await f.getByRole('button', { name: 'Registrar treinamento' }).click();
    await expect(f.getByRole('status')).toHaveText('Treinamento registrado.', { timeout: 15_000 });
    await expect(page.getByRole('list', { name: 'Treinamentos' })).toContainText(`Pessoa ${stamp}`);
  } finally {
    await page.goto(unitUrl);
    const ue = page.getByRole('form', { name: 'Dados da unidade' });
    await ue.getByLabel(/Unidade ativa/).uncheck();
    await ue.getByRole('button', { name: 'Salvar unidade' }).click();
    await expect(ue.getByRole('status')).toHaveText('Unidade salva.', { timeout: 15_000 });
  }
});
