import { expect, test, type Page } from '@playwright/test';

// RN-203/RN-204 — Convite do paciente → criação do acesso → área do paciente → revogação, contra o ambiente
// real com o usuário de teste. Cria um paciente e uma conta de paciente (@example.com) por execução; o
// paciente é arquivado no fim. Contas de paciente de teste: ver db/README (limpeza).
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

async function login(page: Page) {
  await page.goto('/login?next=/app/pacientes');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/pacientes$/);
}

test('convite e área do paciente', async ({ page, browser }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.setTimeout(180_000);
  page.on('dialog', (d) => void d.accept());
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const name = `Paciente App E2E ${stamp}`;
  const patientEmail = `e2e.paciente.${stamp}@example.com`;
  let patientUrl = '';
  const recipeName = `Panqueca E2E ${stamp}`;
  let recipeCreated = false;

  try {
    await test.step('nutricionista cadastra e convida', async () => {
      await login(page);
      await page.getByRole('button', { name: /Novo paciente/ }).click();
      const form = page.getByRole('form', { name: 'Novo paciente' });
      await form.getByLabel('Nome completo').fill(name);
      await form.getByLabel('E-mail (opcional)').fill(patientEmail);
      await form.getByRole('button', { name: 'Salvar paciente' }).click();
      await page.getByRole('link', { name }).first().click();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      patientUrl = page.url();
      // E-mail longo não pode criar rolagem horizontal na ficha (celular)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      const card = page.getByRole('region', { name: 'Área do paciente' });
      await expect(card.getByText('Sem acesso')).toBeVisible();
      await card.getByRole('button', { name: 'Convidar para a área do paciente' }).click();
      await expect(card.getByLabel(/E-mail de acesso/)).toHaveValue(patientEmail);
      await card.getByRole('button', { name: /Gerar link/ }).click();
      await expect(card.getByLabel('Link do convite')).toHaveValue(/\/p\/convite\/[A-Za-z0-9_-]{43}$/);
    });

    const link = await page.getByLabel('Link do convite').inputValue();
    const patientCtx = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: 'pt-BR', reducedMotion: 'reduce' });
    const pp = await patientCtx.newPage();
    const pwd = `Senha-${stamp}`;

    await test.step('paciente cria o acesso pelo link', async () => {
      await pp.goto(link);
      await expect(pp.getByRole('heading', { level: 1, name: 'Olá, Paciente!' })).toBeVisible();
      await expect(pp.getByLabel('E-mail de acesso')).toHaveValue(patientEmail);
      await pp.waitForLoadState('networkidle');
      await pp.getByLabel('Crie uma senha').fill(pwd);
      await pp.getByLabel('Repita a senha').fill(pwd);
      await pp.getByRole('button', { name: /Criar acesso/ }).click();
      await expect(pp).toHaveURL(/\/p$/);
      await expect(pp.getByRole('heading', { level: 1, name: 'Olá, Paciente!' })).toBeVisible();
      await expect(pp.getByText('Seu plano ainda não foi publicado')).toBeVisible();
      // 360 px sem rolagem horizontal
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    await test.step('um nutricionista só: sem troca (RN-211)', async () => {
      await expect(pp.getByRole('link', { name: 'Trocar de nutricionista' })).toHaveCount(0);
      await pp.goto('/p/nutricionistas');
      await expect(pp).toHaveURL(/\/p$/);
    });

    await test.step('nutricionista publica um plano; paciente vê o plano completo (RN-205)', async () => {
      await page.goto(`${patientUrl}/planos`);
      await page.getByRole('button', { name: 'Novo plano' }).click();
      await expect(page).toHaveURL(/\/planos\/[0-9a-f-]{36}$/);
      const meal = page.locator('section[aria-labelledby^="meal-"]').first();
      await meal.getByLabel('Buscar alimento').fill('arroz');
      await meal.getByRole('option').first().click();
      await meal.getByRole('button', { name: /Substituições/ }).first().click();
      await meal.getByRole('button', { name: 'Adicionar' }).first().click();
      await expect(meal.getByRole('button', { name: /Substituições \(1\)/ })).toBeVisible();
      await page.getByLabel(/Orientações para o paciente/).fill('Beba 2 litros de água por dia.');
      await page.getByRole('button', { name: 'Salvar rascunho' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo.' })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Publicar para o paciente' }).click();
      await expect(page.getByRole('button', { name: 'Publicado' })).toBeVisible();

      await pp.goto('/p');
      await pp.getByRole('link', { name: 'Ver plano completo' }).click();
      await expect(pp).toHaveURL(/\/p\/plano/);
      const first = pp.locator('section[id^="refeicao-"]').first();
      await expect(first.getByText(/Arroz/i).first()).toBeVisible();
      await first.getByText(/Pode trocar por \(1\)/).click();
      await expect(first.locator('details[open] li').first()).toBeVisible();
      await expect(pp.getByText('Beba 2 litros de água por dia.')).toBeVisible();
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    await test.step('paciente baixa o PDF do plano; plano de outro não abre (RN-209)', async () => {
      await pp.goto('/p');
      await pp.getByRole('link', { name: /Documentos/ }).click();
      const list = pp.getByRole('list', { name: 'Planos alimentares' });
      await expect(list.getByRole('listitem')).toHaveCount(1);
      await expect(list).toContainText('Plano atual');
      const download = pp.waitForEvent('download');
      await list.getByRole('link', { name: /Baixar PDF/ }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^plano-alimentar-\d{4}-\d{2}-\d{2}\.pdf$/);
      const { readFile } = await import('node:fs/promises');
      expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe('%PDF-');
      const other = await pp.request.get('/p/documentos/00000000-0000-4000-8000-000000000000/pdf');
      expect(other.status()).toBe(404);
    });

    await test.step('o que o paciente vê: calorias liberadas e pré-visualização (RN-210)', async () => {
      await pp.goto('/p/plano');
      await expect(pp.getByRole('region', { name: 'Totais do dia' })).toHaveCount(0);

      await page.goto(patientUrl);
      const share = page.getByRole('form', { name: 'O que o paciente vê' });
      await share.getByRole('switch', { name: /Calorias do plano/ }).check();
      await share.getByRole('switch', { name: /Histórico de peso/ }).check();
      await share.getByRole('button', { name: 'Salvar' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Salvo.' })).toBeVisible();

      await page.getByRole('link', { name: 'Ver como paciente' }).click();
      const preview = page.getByRole('region', { name: 'Pré-visualização da área do paciente' });
      await expect(preview.getByText(/Energia no dia/)).toBeVisible();
      await expect(preview.getByText(/Proteínas no dia/)).toHaveCount(0);
      await expect(preview.getByText(/Sem pesagens ainda/)).toBeVisible();

      await pp.goto('/p/plano');
      await expect(pp.getByRole('region', { name: 'Totais do dia' }).getByText(/kcal/)).toBeVisible();
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    await test.step('ids trocados nas rotas do paciente não abrem nada (RN-213)', async () => {
      // Rascunho de um plano novo do mesmo paciente: nem pelo id
      await page.goto(`${patientUrl}/planos`);
      await page.getByRole('button', { name: 'Novo plano' }).click();
      await expect(page).toHaveURL(/\/planos\/[0-9a-f-]{36}$/);
      const draftId = page.url().split('/').pop()!;
      expect((await pp.request.get(`/p/documentos/${draftId}/pdf`)).status()).toBe(404);
      await pp.goto('/p/documentos');
      await expect(pp.getByRole('list', { name: 'Planos alimentares' }).getByRole('listitem')).toHaveCount(1);
      // Registro de outra pessoa (id do próprio rascunho como se fosse paciente) e foto inexistente
      await pp.goto(`/p/plano?c=${draftId}`);
      await expect(pp.getByRole('heading', { level: 1 })).not.toHaveText(/Rascunho/);
      expect((await pp.request.get('/api/receitas/999999999/foto')).status()).toBe(404);
      expect((await pp.request.get(`/api/consultorio/${draftId}/logo`)).status()).toBe(404);
      // Paciente não abre telas do nutricionista
      await pp.goto(`${patientUrl.replace(/^https?:\/\/[^/]+/, '')}/planos`);
      await expect(pp).toHaveURL(/\/p$/);
    });

    await test.step('nutricionista cria receita com foto e envia; paciente vê (RN-206, RN-207)', async () => {
      await page.goto('/app/receitas');
      await page.getByRole('button', { name: 'Nova receita' }).click();
      const form = page.getByRole('form', { name: 'Nova preparação' });
      await form.getByLabel('Nome').fill(recipeName);
      await form.getByLabel('Buscar ingrediente').fill('aveia');
      await form.getByRole('listbox').getByRole('option').first().click();
      await form.getByLabel('Rendimento: peso pronto (g)').fill('200');
      await form.getByLabel('Porções (opcional)').fill('2');
      await form.getByLabel('Tempo de preparo (min, opcional)').fill('15');
      await form.getByLabel('Dificuldade (opcional)').selectOption('easy');
      await form.getByLabel(/Tags/).fill(`e2e ${stamp}, café da manhã`);
      await form.getByLabel('Modo de preparo (opcional)').fill('Misture tudo e leve à frigideira.');
      const png = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 48;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#c0703a'; ctx.fillRect(0, 0, 64, 48);
        return c.toDataURL('image/png').split(',')[1]!;
      });
      await form.getByLabel('Foto da receita').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
      await expect(form.getByRole('img', { name: 'Foto da receita' })).toBeVisible();
      await form.getByRole('button', { name: /Salvar preparação/ }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Preparação cadastrada' })).toBeVisible({ timeout: 20_000 });
      recipeCreated = true;
      await page.getByRole('group', { name: 'Filtrar por tag' }).getByRole('button', { name: `e2e ${stamp}` }).click();
      const cards = page.getByRole('list', { name: 'Receitas' }).getByRole('listitem');
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText('2 porções · 15 min · Fácil');
      await expect.poll(() => cards.first().locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);

      await page.goto(patientUrl);
      const box = page.getByRole('region', { name: 'Receitas do paciente' });
      await box.getByLabel('Receita', { exact: true }).selectOption({ label: recipeName });
      await box.getByLabel('Observação (opcional)').fill('Boa opção para o café.');
      await box.getByRole('button', { name: 'Enviar' }).click();
      await expect(box.getByRole('list', { name: 'Receitas visíveis para o paciente' })).toContainText(recipeName);

      await pp.goto('/p');
      await pp.getByRole('link', { name: /Receitas/ }).first().click();
      await expect(pp).toHaveURL(/\/p\/receitas/);
      await pp.getByRole('link', { name: new RegExp(recipeName) }).click();
      await expect(pp.getByRole('heading', { level: 1, name: recipeName })).toBeVisible();
      await expect(pp.getByText('Boa opção para o café.')).toBeVisible();
      await expect(pp.getByRole('region', { name: 'Ingredientes' })).toContainText(/aveia/i);
      await expect(pp.getByText('Misture tudo e leve à frigideira.')).toBeVisible();
      await expect.poll(() => pp.getByRole('img', { name: `Foto de ${recipeName}` }).evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      // Receita de outro id que não foi enviada: não encontrada
      await pp.goto('/p/receitas/1');
      await expect(pp.getByText('Receita não encontrada')).toBeVisible();
    });

    await test.step('recomendações: publicada da biblioteca, rascunho escondido, leitura registrada (RN-208)', async () => {
      await page.goto(`${patientUrl}/recomendacoes`);
      await page.getByRole('button', { name: 'Da biblioteca' }).click();
      const lib = page.getByRole('group', { name: 'Biblioteca de orientações' });
      const firstOption = lib.locator('label').first();
      const libTitle = (await firstOption.locator('span.font-medium').innerText()).trim();
      await firstOption.getByRole('checkbox').check();
      await lib.getByRole('button', { name: /Publicar selecionadas \(1\)/ }).click();
      await expect(page.getByRole('status').filter({ hasText: '1 recomendação publicada.' })).toBeVisible();

      await page.getByRole('button', { name: 'Nova recomendação' }).click();
      const form = page.getByRole('form', { name: 'Nova recomendação' });
      await form.getByLabel('Categoria').fill('Sono');
      await form.getByLabel('Título').fill(`Rascunho E2E ${stamp}`);
      await form.getByLabel('Texto para o paciente').fill('Ainda não publicado.');
      await form.getByRole('button', { name: 'Salvar rascunho' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo.' })).toBeVisible();
      const items = page.getByRole('list', { name: 'Recomendações do paciente' });
      await expect(items.getByRole('listitem').filter({ hasText: libTitle }).getByText('Ainda não lida')).toBeVisible();

      await pp.goto('/p');
      await expect(pp.getByRole('link', { name: /Recomendações\s*1 nova/ })).toBeVisible();
      await pp.getByRole('link', { name: /Recomendações/ }).click();
      await expect(pp.getByText(`Rascunho E2E ${stamp}`)).toHaveCount(0);
      const summary = pp.locator('summary').filter({ hasText: libTitle });
      await expect(summary.getByText('Nova')).toBeVisible();
      await summary.click();
      await expect(summary.getByText('Nova')).toHaveCount(0);
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      await expect.poll(async () => {
        await page.reload();
        return items.getByRole('listitem').filter({ hasText: libTitle }).getByText(/Lida em/).count();
      }, { timeout: 15_000 }).toBe(1);
    });

    await test.step('documento clínico: rascunho escondido, publicado baixa o PDF com a marca (RN-215)', async () => {
      await page.goto(`${patientUrl}/documentos`);
      await page.getByRole('button', { name: 'Novo documento' }).click();
      const form = page.getByRole('form', { name: 'Novo documento' });
      await expect(form.getByLabel('Tipo', { exact: true })).toHaveValue('exam_request');
      await form.getByLabel('Título').fill(`Pedido de exames E2E ${stamp}`);
      await form.getByRole('checkbox', { name: 'Hemograma completo' }).check();
      await form.getByRole('checkbox', { name: 'Ferritina' }).check();
      await form.getByRole('button', { name: 'Salvar rascunho' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo.' })).toBeVisible();
      const item = page.getByRole('list', { name: 'Documentos do paciente' }).getByRole('listitem').filter({ hasText: `Pedido de exames E2E ${stamp}` });
      await expect(item.getByText('Rascunho')).toBeVisible();
      const href = (await item.getByRole('link', { name: /Baixar PDF/ }).getAttribute('href'))!;
      const docId = href.split('/').at(-2)!;
      // Profissional baixa o rascunho; paciente não vê nem pelo id
      const own = await page.request.get(href);
      expect(own.status()).toBe(200);
      expect((await own.body()).subarray(0, 5).toString()).toBe('%PDF-');
      expect((await pp.request.get(`/p/documentos/doc/${docId}/pdf`)).status()).toBe(404);
      await pp.goto('/p/documentos');
      await expect(pp.getByRole('list', { name: 'Documentos do nutricionista' })).toHaveCount(0);

      await item.getByRole('button', { name: 'Publicar' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Documento publicado.' })).toBeVisible();
      await pp.reload();
      const docs = pp.getByRole('list', { name: 'Documentos do nutricionista' });
      await expect(docs.getByRole('listitem')).toHaveCount(1);
      await expect(docs).toContainText('Pedido de exames');
      const download = pp.waitForEvent('download');
      await docs.getByRole('link', { name: /Baixar PDF/ }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^pedido-de-exames-e2e-\d+-\d{4}-\d{2}-\d{2}\.pdf$/);
      const { readFile } = await import('node:fs/promises');
      expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe('%PDF-');
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    await test.step('link usado não abre de novo; paciente não entra no painel do nutricionista', async () => {
      await pp.goto(link);
      await expect(pp.getByText('Convite indisponível')).toBeVisible();
      await pp.goto('/app/pacientes');
      await expect(pp).toHaveURL(/\/p$/);
    });

    await test.step('nutricionista vê o acesso ativo e revoga', async () => {
      await page.goto(patientUrl);
      const card = page.getByRole('region', { name: 'Área do paciente' });
      await expect(card.getByText('Acesso ativo')).toBeVisible();
      await card.getByRole('button', { name: 'Revogar acesso' }).click();
      await expect(card.getByText('Sem acesso')).toBeVisible();
      await pp.goto('/p');
      await expect(pp.getByText(/não está ligada a nenhum nutricionista/)).toBeVisible();
    });
    await patientCtx.close();
  } finally {
    if (patientUrl) {
      await page.goto(patientUrl);
      await page.getByRole('button', { name: 'Arquivar' }).click();
      await expect(page.getByRole('button', { name: 'Reativar' })).toBeVisible();
    }
    if (recipeCreated) {
      await page.goto('/app/alimentos');
      await page.getByRole('tab', { name: 'Preparações' }).click();
      await page.getByRole('button', { name: `Arquivar ${recipeName}` }).click();
      await expect(page.getByRole('status').filter({ hasText: `${recipeName} foi arquivado` })).toBeVisible();
    }
  }
});
