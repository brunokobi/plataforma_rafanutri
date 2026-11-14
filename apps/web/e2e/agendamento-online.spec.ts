import { expect, test } from '@playwright/test';

// RN-068 — Página pública e agendamento online contra o ambiente real. Liga a página do consultório de teste,
// um visitante pede um horário, o mesmo horário não pode ser pedido de novo, o nutricionista recusa e a página é
// desligada no fim (nenhum paciente é criado).
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
const API = process.env.E2E_DIRECTUS_URL ?? 'https://rafanutri-api.brunokobi.tech';

test('agendamento online pela página pública', async ({ page, browser }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.skip(!process.env.E2E_BASE_URL, 'Só contra o ambiente publicado (usa a API pública do Directus).');
  test.setTimeout(150_000);
  page.on('dialog', (d) => void d.accept());
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const visitor = `Visitante E2E ${stamp}`;

  await page.goto('/login?next=/app/configuracoes/pagina-publica');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/configuracoes\/pagina-publica$/);

  const form = page.getByRole('form', { name: 'Página pública' });
  const setup = async (on: boolean) => {
    await page.goto('/app/configuracoes/pagina-publica');
    await form.getByLabel('Página pública no ar').setChecked(on);
    await form.getByLabel('Agendamento online').setChecked(on);
    if (on) {
      await form.getByLabel('Eu confirmo cada pedido antes de virar consulta (recomendado)').check();
      for (const d of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']) await form.getByLabel(d, { exact: true }).check();
      await form.getByLabel('Chamada').fill('Nutrição de verdade, sem dieta da moda');
    }
    await form.getByRole('button', { name: 'Salvar página' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Página salva.' })).toBeVisible();
  };

  await setup(true);
  const url = (await form.getByRole('link', { name: /\/n\// }).textContent())!.trim();
  const slug = url.split('/n/')[1]!;

  const ctx = await browser.newContext();
  const pub = await ctx.newPage();
  try {
    const before = await (await pub.request.get(`${API}/rafanutri/public/practices/${slug}/slots?days=7`)).json();
    const firstIso: string = before.data.days.find((d: { slots: unknown[] }) => d.slots.length > 0).slots[0].starts_at;
    await pub.goto(`/n/${slug}`);
    await expect(pub.getByText('Nutrição de verdade, sem dieta da moda')).toBeVisible();
    const slot = pub.getByRole('group', { name: 'Horários livres' }).getByRole('button').first();
    await slot.click();
    const data = pub.getByRole('form', { name: 'Seus dados' });
    await data.getByLabel('Nome completo').fill(visitor);
    await data.getByLabel('E-mail').fill(`e2e.visitante.${stamp}@example.com`);
    await data.getByLabel('Celular (WhatsApp)').fill('(31) 99999-0000');
    await data.getByLabel(/Autorizo o consultório/).check();
    await data.getByRole('button', { name: 'Pedir agendamento' }).click();
    await expect(pub.getByRole('status')).toContainText('Pedido enviado!');
    expect(await pub.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // O mesmo horário sai da lista e não pode ser pedido de novo (direto na API pública); pedidos não são públicos
    const after = await (await pub.request.get(`${API}/rafanutri/public/practices/${slug}/slots?days=7`)).json();
    expect(JSON.stringify(after)).not.toContain(firstIso);
    const again = await pub.request.post(`${API}/rafanutri/public/practices/${slug}/book`, {
      data: { full_name: 'Outro Visitante', email: `e2e.outro.${stamp}@example.com`, phone: '(31) 98888-0000', mode: 'online', consent: true, starts_at: firstIso },
    });
    expect(again.status()).toBe(409);
    expect((await pub.request.get(`${API}/rafanutri/booking-requests`)).status()).toBe(401);

    // Nutricionista vê o pedido na agenda e recusa (libera o horário, não cria paciente)
    await page.goto('/app/agenda');
    const req = page.getByRole('list', { name: 'Pedidos de agendamento' }).getByRole('listitem').filter({ hasText: visitor });
    await expect(req).toBeVisible();
    await req.getByRole('button', { name: `Recusar pedido de ${visitor}` }).click();
    await expect(page.getByRole('status').filter({ hasText: `Pedido de ${visitor} recusado.` })).toBeVisible();
  } finally {
    await ctx.close();
    await setup(false);
    const off = await page.request.get(`/n/${slug}`);
    expect(off.status()).toBe(404);
  }
});
