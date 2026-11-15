import { expect, test } from '@playwright/test';

// U1a — Checklist de Boas Práticas no celular: o owner cria uma unidade, faz a "Abertura da cozinha"
// com a geladeira fora do limite (7 °C, item crítico: exige foto e comentário), conclui com 87,5% e vê a
// não conformidade aberta na unidade. No fim desativa a unidade (libera a vaga do contrato de teste).
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
// PNG 8×8 válido (o navegador reduz e envia como JPEG)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=', 'base64');

test('checklist, temperaturas e não conformidade no celular', async ({ page }) => {
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
  const name = `Checklist E2E ${Date.now()}`;
  await form.getByLabel('Nome da unidade').fill(name);
  await form.getByRole('button', { name: 'Criar unidade' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15_000 });

  try {
    await page.getByRole('list', { name: 'Modelos de checklist' }).getByRole('button', { name: 'Iniciar Abertura da cozinha' }).click();
    await expect(page).toHaveURL(/\/app\/uan\/checklists\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Abertura da cozinha' })).toBeVisible();

    const item = (n: number) => expect(page.getByText(new RegExp(`^Item ${n} de 9`))).toBeVisible({ timeout: 15_000 });
    const answer = async (n: number, label: 'Conforme' | 'Não se aplica') => {
      await item(n);
      await page.getByRole('group', { name: 'Resposta' }).getByRole('button', { name: label, exact: true }).click();
    };
    for (const n of [1, 2, 3, 4]) await answer(n, 'Conforme');

    // geladeira a 7 °C: fora do limite, item crítico
    await item(5);
    await expect(page.getByText('Esperado: até 5 °C.')).toBeVisible();
    await page.getByLabel('Valor medido (°C)').fill('7');
    await page.getByRole('button', { name: 'Salvar valor' }).click();
    await expect(page.getByText('Fora do limite: registre o que foi feito.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Para concluir, falta a foto e o comentário.')).toBeVisible();
    await page.getByLabel(/Foto da evidência/).setInputFiles({ name: 'termometro.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('status').filter({ hasText: 'Foto salva.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('img', { name: 'Evidência do item 5' })).toBeVisible();
    await page.getByLabel(/O que foi encontrado/).fill('Porta mal fechada; ajustada e alimentos transferidos.');
    await page.getByRole('button', { name: 'Salvar comentário' }).click();

    await item(6);
    await page.getByLabel('Valor medido (°C)').fill('-20');
    await page.getByRole('button', { name: 'Salvar valor' }).click();
    await answer(7, 'Conforme');
    await answer(8, 'Conforme');
    await answer(9, 'Não se aplica');

    const review = page.getByRole('region', { name: 'Revisar e concluir' });
    await expect(review).toBeVisible({ timeout: 15_000 });
    await expect(review.getByText('87,5%')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await review.getByRole('button', { name: 'Concluir checklist' }).click();

    await expect(page.getByLabel('Conformidade')).toHaveText('87,5%', { timeout: 15_000 });
    await expect(page.getByText('1 não conformidade(s) aberta(s) por itens críticos.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Evidência do item 5' })).toBeVisible();

    await page.getByRole('link', { name: `← ${name}` }).click();
    await expect(page.getByRole('list', { name: 'Não conformidades abertas' }).getByText(/Temperatura da câmara ou geladeira/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('list', { name: 'Checklists concluídos' }).getByText('87,5%')).toBeVisible();

    // RN-151: geladeira com limite padrão; leitura fora exige ação; duas seguidas fora abrem não conformidade
    await page.getByRole('button', { name: 'Novo equipamento' }).click();
    const eqForm = page.getByRole('form', { name: 'Novo equipamento' });
    await eqForm.getByLabel('Nome do equipamento').fill('Geladeira E2E');
    await expect(eqForm.getByLabel('Máximo (°C)')).toHaveValue('5');
    await eqForm.getByRole('button', { name: 'Cadastrar equipamento' }).click();
    const eqCard = page.getByRole('list', { name: 'Equipamentos' }).getByRole('listitem').filter({ hasText: 'Geladeira E2E' });
    await expect(eqCard.getByText('Sem leitura', { exact: true })).toBeVisible({ timeout: 15_000 });
    await eqCard.getByRole('link', { name: 'Registrar temperatura' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Geladeira E2E' })).toBeVisible({ timeout: 15_000 });

    const rec = page.getByRole('form', { name: 'Registrar temperatura de Geladeira E2E' });
    await rec.getByLabel('Temperatura (°C)').fill('4');
    await rec.getByRole('button', { name: 'Registrar' }).click();
    await expect(rec.getByRole('status')).toContainText('4 °C', { timeout: 15_000 });
    await expect(rec.getByRole('status')).toContainText('dentro do limite');
    for (const v of ['7', '8,5']) {
      await rec.getByLabel('Temperatura (°C)').fill(v);
      await expect(rec.getByText('Fora do limite: o que foi feito?')).toBeVisible();
      await rec.getByRole('button', { name: 'Registrar' }).click();
      await expect(rec.getByRole('alert')).toHaveText('Temperatura fora do limite: registre a ação corretiva.');
      await rec.getByLabel('Ação corretiva').fill('Porta fechada e alimentos transferidos.');
      await rec.getByRole('button', { name: 'Registrar' }).click();
      await expect(rec.getByRole('status')).toContainText('fora do limite, com ação corretiva', { timeout: 15_000 });
    }
    await expect(page.getByRole('img', { name: /Temperatura de Geladeira E2E: 3 leituras/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('table')).toContainText('Porta fechada e alimentos transferidos.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.getByRole('link', { name: /Etiqueta com QR code/ }).click();
    await expect(page.getByRole('img', { name: 'QR code para registrar a temperatura' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: '← Geladeira E2E' }).click();
    await page.getByRole('link', { name: `← ${name}` }).click();

    await expect(page.getByRole('list', { name: 'Não conformidades abertas' }).getByText('Geladeira E2E: temperatura fora do limite em leituras seguidas')).toBeVisible({ timeout: 15_000 });
    await expect(eqCard.getByText('Fora do limite', { exact: true })).toBeVisible();

    // temperatura de alimento
    const food = page.getByRole('form', { name: 'Registrar temperatura de alimento' });
    await food.getByLabel('Alimento ou preparação').fill('Frango assado');
    await food.getByLabel('Temperatura (°C)').fill('78');
    await food.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByRole('list', { name: 'Temperaturas de alimentos' }).getByText('Frango assado')).toBeVisible({ timeout: 15_000 });

    // RN-153/154: quadro, plano 5W2H, ação feita e fechamento com foto
    await page.getByRole('link', { name: /Quadro de não conformidades/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Não conformidades' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('list', { name: 'Aberta' }).getByRole('link', { name: /Geladeira E2E: temperatura fora do limite/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Geladeira E2E: temperatura fora do limite/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Plano de ação (5W2H)' }).click();
    const plan = page.getByRole('form', { name: 'Plano de ação' });
    await plan.getByLabel('O quê (ação)').fill('Trocar a borracha da porta');
    await plan.getByLabel('Por quê (causa)').fill('Vedação gasta');
    await plan.getByLabel('Nome do responsável').fill('Manutenção');
    await plan.getByLabel('Quando (prazo)').fill(new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10));
    await plan.getByLabel('Quanto (R$, opcional)').fill('120');
    await plan.getByRole('button', { name: 'Salvar plano' }).click();
    const actions = page.getByRole('list', { name: 'Ações' });
    await expect(actions.getByText('Trocar a borracha da porta')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Em tratamento', { exact: true })).toBeVisible();
    await actions.getByRole('button', { name: 'Marcar como feita' }).click();
    await actions.getByLabel('O que foi feito (opcional)').fill('Borracha trocada');
    await actions.getByRole('button', { name: 'Confirmar' }).click();
    const close = page.getByRole('form', { name: 'Fechar não conformidade' });
    await expect(close).toBeVisible({ timeout: 15_000 });
    await close.getByLabel('Como foi verificado').fill('Geladeira estável a 4 °C por 24 h');
    await close.getByRole('button', { name: 'Fechar não conformidade' }).click();
    await expect(close.getByRole('alert')).toHaveText('Anexe a foto da evidência para fechar.');
    await close.getByLabel('Foto da evidência (obrigatória)').setInputFiles({ name: 'evidencia.png', mimeType: 'image/png', buffer: PNG });
    await expect(close.getByText('Foto pronta para enviar.')).toBeVisible();
    await close.getByRole('button', { name: 'Fechar não conformidade' }).click();
    await expect(page.getByRole('heading', { name: /^Fechada em/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('img', { name: 'Evidência do fechamento' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('link', { name: /← Não conformidades de/ }).click();
    await expect(page.getByRole('list', { name: 'Fechada' }).getByText(/Geladeira E2E/)).toBeVisible({ timeout: 15_000 });
  } finally {
    await page.goto(page.url().includes('/unidades/') ? page.url() : '/app/uan');
    if (!page.url().includes('/unidades/')) await page.getByRole('link', { name }).click();
    const edit = page.getByRole('form', { name: 'Dados da unidade' });
    await edit.getByLabel(/Unidade ativa/).uncheck();
    await edit.getByRole('button', { name: 'Salvar unidade' }).click();
    await expect(edit.getByRole('status')).toHaveText('Unidade salva.', { timeout: 15_000 });
  }
});
