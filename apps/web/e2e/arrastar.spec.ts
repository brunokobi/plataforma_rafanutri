import { expect, test } from '@playwright/test';

// RN-022 — Arrastar uma consulta para outro dia remarca no mesmo horário (só no computador: o celular usa "Remarcar").
// Marca às 06:15 numa segunda daqui a ~5 semanas (fora do expediente, sem disputar horário com os outros testes),
// arrasta para a quarta e cancela no fim.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('arrastar consulta para outro dia', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.skip(test.info().project.name === 'mobile', 'Arrastar é do computador.');

  const d = new Date(Date.now() + 35 * 86400e3);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1));
  const monday = d.toISOString().slice(0, 10);

  await page.goto(`/login?next=/app/agenda`);
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app\/agenda$/);
  await page.goto(`/app/agenda?semana=${monday}`);

  await page.getByRole('button', { name: 'Nova consulta' }).click();
  const form = page.getByRole('form', { name: 'Nova consulta' });
  const patient = form.getByLabel('Paciente');
  await patient.selectOption({ index: 1 });
  await form.getByLabel('Data').fill(monday);
  await form.getByLabel('Horário', { exact: true }).fill('06:15');
  await form.getByRole('button', { name: 'Marcar consulta' }).click();
  await expect(form).toBeHidden({ timeout: 15_000 });

  const mon = page.getByRole('region', { name: /^seg / });
  const wed = page.getByRole('region', { name: /^qua / });
  // Só consultas em aberto (rodadas anteriores deixam canceladas no mesmo horário).
  const openCard = (root: import('@playwright/test').Locator) =>
    root.getByRole('listitem', { name: /^06:15 / }).filter({ has: page.getByRole('button', { name: 'Concluir' }) });
  const card = openCard(mon).first();
  await expect(card).toBeVisible();
  try {
    await card.dragTo(wed);
    await expect(page.getByRole('status').filter({ hasText: /remarcada para qua .* às 06:15/ })).toBeVisible({ timeout: 15_000 });
    await expect(openCard(wed)).toHaveCount(1);
  } finally {
    const moved = openCard(page.getByRole('main')).first();
    await moved.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'cancelada' })).toBeVisible({ timeout: 15_000 });
  }
});
