import { expect, test } from '@playwright/test';

// U7 — Perfis e regras do cardápio: copia o modelo PAT, cria uma regra de teto de custo do perfil, usa o
// perfil num cardápio e confere a coluna de metas e o aviso da regra. No fim tira tudo de uso.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('perfil PAT e regra do contrato no cardápio', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.skip(test.info().project.name !== 'desktop', 'Planejamento é feito no computador.');
  test.setTimeout(150_000);
  const stamp = Date.now();
  const profileName = `PAT E2E ${stamp}`;

  await page.goto('/login?next=/app/uan/perfis');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Perfis e regras do cardápio' })).toBeVisible({ timeout: 20_000 });
  const perfisUrl = page.url();

  await page.getByRole('button', { name: 'Copiar PAT — almoço, jantar e ceia' }).click();
  const pf = page.getByRole('form', { name: /^Perfil PAT — almoço, jantar e ceia — personalizado/ }).last();
  await expect(pf).toBeVisible({ timeout: 15_000 });
  await pf.getByLabel('Nome').fill(profileName);
  await expect(pf.getByLabel('Energia (kcal) — mínimo')).toHaveValue('600');
  await pf.getByLabel('Metas revisadas pela RT').check();
  await pf.getByRole('button', { name: 'Salvar perfil' }).click();
  const myProfiles = page.getByRole('list', { name: 'Perfis da empresa' });
  await expect(myProfiles.getByRole('listitem').filter({ hasText: profileName }).getByText('Revisado pela RT')).toBeVisible({ timeout: 15_000 });

  const rf = page.getByRole('form', { name: 'Nova regra' });
  await rf.getByLabel('Tipo de regra').selectOption({ label: 'Teto de custo por refeição' });
  await rf.getByLabel('Vale para').selectOption({ label: `Perfil ${profileName}` });
  await rf.getByLabel('Teto por refeição (R$)').fill('0,01');
  await rf.getByRole('button', { name: 'Criar regra' }).click();
  const rules = page.getByRole('list', { name: 'Regras do contrato' });
  await expect(rules.getByRole('listitem').filter({ hasText: `só no perfil ${profileName}` })).toBeVisible({ timeout: 15_000 });

  await page.goto('/app/uan');
  await page.getByRole('button', { name: 'Nova unidade' }).click();
  const uf = page.getByRole('form', { name: 'Nova unidade' });
  const unitName = `Perfis E2E ${stamp}`;
  await uf.getByLabel('Nome da unidade').fill(unitName);
  await uf.getByRole('button', { name: 'Criar unidade' }).click();
  await expect(page.getByRole('heading', { level: 1, name: unitName })).toBeVisible({ timeout: 15_000 });
  const unitUrl = new URL(page.url()).pathname;
  try {
    await page.getByRole('link', { name: 'Cardápios da unidade' }).click();
    await page.getByRole('button', { name: 'Novo cardápio' }).click();
    const cf = page.getByRole('form', { name: 'Novo cardápio' });
    await cf.getByLabel('Nome do cardápio').fill('Semana perfis');
    await cf.getByLabel('Começa em').fill(new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10));
    await cf.getByLabel('Ciclo').selectOption('7');
    await cf.getByRole('button', { name: 'Criar cardápio' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Semana perfis' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Editar dados' }).click();
    const ef = page.getByRole('form', { name: 'Dados do cardápio' });
    await ef.getByLabel('Perfil de público').selectOption({ label: profileName });
    await ef.getByLabel('Modelo de cardápio').selectOption({ label: 'Padronizado (rede)' });
    await ef.getByRole('button', { name: 'Salvar dados' }).click();
    await expect(page.getByText(`Perfil: ${profileName}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Padronizado (rede)')).toBeVisible();

    const main1 = page.getByLabel('Prato principal do dia 1');
    await main1.selectOption({ index: 1 });
    await expect(page.getByRole('columnheader', { name: 'Metas' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('row').filter({ hasText: 'Dia 1' }).getByText(/Dentro das metas|baixo|alto/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Regras do contrato \(/ })).toBeVisible();
    await expect(page.getByText(/acima do teto do contrato/).first()).toBeVisible();
  } finally {
    await page.goto(unitUrl);
    const ue = page.getByRole('form', { name: 'Dados da unidade' });
    await ue.getByLabel(/Unidade ativa/).uncheck();
    await ue.getByRole('button', { name: 'Salvar unidade' }).click();
    await expect(ue.getByRole('status')).toHaveText('Unidade salva.', { timeout: 15_000 });
    await page.goto(perfisUrl);
    await page.getByRole('button', { name: new RegExp(`^Remover regra Teto de R\\$ 0,01`) }).first().click();
    await expect(page.getByRole('status').filter({ hasText: 'Regra removida.' })).toBeVisible({ timeout: 15_000 });
    const item = page.getByRole('list', { name: 'Perfis da empresa' }).getByRole('listitem').filter({ hasText: profileName });
    await item.getByRole('button', { name: 'Editar' }).click();
    await item.getByLabel('Perfil em uso').uncheck();
    await item.getByRole('button', { name: 'Salvar perfil' }).click();
    await expect(item.getByText(/fora de uso/)).toBeVisible({ timeout: 15_000 });
  }
});
