import { expect, test } from '@playwright/test';

// RN-149 — Checklist sem internet: com a conexão cortada no meio, as respostas e a conclusão ficam na fila do
// aparelho; quando a conexão volta, tudo é enviado e o checklist aparece concluído no servidor.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('checklist feito sem internet é enviado quando a conexão volta', async ({ page, context }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.skip(test.info().project.name !== 'mobile', 'Checklist é feito no celular.');
  test.setTimeout(120_000);

  await page.goto('/login?next=/app/uan');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app\/uan$/);
  await page.getByRole('button', { name: 'Nova unidade' }).click();
  const form = page.getByRole('form', { name: 'Nova unidade' });
  const name = `Offline E2E ${Date.now()}`;
  await form.getByLabel('Nome da unidade').fill(name);
  await form.getByRole('button', { name: 'Criar unidade' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15_000 });
  const unitUrl = new URL(page.url()).pathname;

  try {
    await page.getByRole('list', { name: 'Modelos de checklist' }).getByRole('button', { name: 'Iniciar Higiene dos manipuladores', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Higiene dos manipuladores' })).toBeVisible({ timeout: 15_000 });
    const answer = async (n: number) => {
      await expect(page.getByText(new RegExp(`^Item ${n} de 8`))).toBeVisible({ timeout: 15_000 });
      await page.getByRole('group', { name: 'Resposta' }).getByRole('button', { name: 'Conforme', exact: true }).click();
    };
    await answer(1);

    await context.setOffline(true);
    for (const n of [2, 3, 4, 5, 6, 7, 8]) await answer(n);
    const banner = page.getByRole('note', { name: 'Situação da conexão' });
    await expect(banner).toContainText('Sem conexão');
    await expect(banner).toContainText('7 alteração(ões) aguardando envio');
    const review = page.getByRole('region', { name: 'Revisar e concluir' });
    await expect(review.getByText('100%')).toBeVisible();
    await review.getByRole('button', { name: 'Concluir checklist' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Concluído no aparelho' })).toBeVisible();
    await expect(banner).toContainText('8 alteração(ões) aguardando envio');

    await context.setOffline(false);
    await expect(page.getByLabel('Conformidade')).toHaveText('100%', { timeout: 40_000 });
    await expect(page.getByText(/8 conforme\(s\) · 0 não conforme\(s\)/)).toBeVisible();
  } finally {
    await context.setOffline(false);
    await page.goto(unitUrl);
    const edit = page.getByRole('form', { name: 'Dados da unidade' });
    await edit.getByLabel(/Unidade ativa/).uncheck();
    await edit.getByRole('button', { name: 'Salvar unidade' }).click();
    await expect(edit.getByRole('status')).toHaveText('Unidade salva.', { timeout: 15_000 });
  }
});
