import { expect, test } from '@playwright/test';

// RN-022 — Expediente da agenda: o owner muda início, fim e dias; a agenda passa a sugerir só dentro dele.
// Volta ao padrão (08h–18h, todos os dias) no fim, mesmo se falhar no meio.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

async function setSchedule(page: import('@playwright/test').Page, start: string, end: string, on: string[]) {
  await page.goto('/app/configuracoes/consultorio');
  const form = page.getByRole('form', { name: 'Expediente da agenda' });
  await form.getByLabel('Início').fill(start);
  await form.getByLabel('Fim').fill(end);
  for (const d of DAYS) {
    const b = form.getByRole('button', { name: d, exact: true });
    if ((await b.getAttribute('aria-pressed')) !== String(on.includes(d))) await b.click();
  }
  await form.getByRole('button', { name: 'Salvar expediente' }).click();
  await expect(form.getByRole('status')).toHaveText('Expediente salvo.', { timeout: 15_000 });
}

test('expediente da agenda', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  await page.goto('/login?next=/app/configuracoes/consultorio');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app\/configuracoes\/consultorio$/);

  try {
    await setSchedule(page, '07:30', '09:30', ['Seg']);
    await page.goto('/app/agenda');
    await page.getByRole('button', { name: 'Nova consulta' }).click();
    const form = page.getByRole('form', { name: 'Nova consulta' });
    await expect(form.getByText('Horários livres nesse dia (expediente 07h30–09h30):')).toBeVisible();
    // próxima segunda: dentro do expediente; próximo domingo: fora
    const next = (iso: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7 + ((iso - (d.getUTCDay() || 7) + 7) % 7));
      return d.toISOString().slice(0, 10);
    };
    await form.getByLabel('Data').fill(next(1));
    await expect(form.getByRole('group', { name: 'Horários livres' }).getByRole('button').first()).toHaveText('07:30');
    await form.getByLabel('Data').fill(next(7));
    await expect(form.getByText('Dia fora do expediente.', { exact: false })).toBeVisible();
  } finally {
    await setSchedule(page, '08:00', '18:00', DAYS);
  }
});
