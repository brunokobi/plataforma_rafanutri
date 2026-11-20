import { expect, test } from '@playwright/test';

// U2a — Insumos e fornecedores da UAN: cadastra um fornecedor e um insumo em litro com densidade, alergênicos e
// vínculo à TACO, registra o preço e confere o preço por kg. No fim tira os dois de uso (não acumula na lista).
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('insumo com preço e fornecedor', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.skip(test.info().project.name !== 'desktop', 'Cadastro é feito no computador.');
  test.setTimeout(120_000);
  const stamp = Date.now();
  const supplier = `Laticínios E2E ${stamp}`;
  const name = `Leite E2E ${stamp}`;

  await page.goto('/login?next=/app/uan');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/^[^?]*\/app\/uan$/);

  await page.getByRole('navigation', { name: 'Cadastros de Consultório de Teste Rafanutri' }).getByRole('link', { name: 'Fornecedores' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fornecedores' })).toBeVisible();
  await page.getByRole('button', { name: 'Novo fornecedor' }).click();
  const sf = page.getByRole('form', { name: 'Novo fornecedor' });
  await sf.getByLabel('Nome do fornecedor').fill(supplier);
  await sf.getByLabel('CNPJ (opcional)').fill('12.345.678/0001-90');
  await sf.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
  const supItem = page.getByRole('list', { name: 'Fornecedores' }).getByRole('listitem').filter({ hasText: supplier });
  await expect(supItem.getByText(/CNPJ 12\.345\.678\/0001-90/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: 'Insumos', exact: true }).click();
  await page.getByRole('button', { name: 'Novo insumo' }).click();
  const f = page.getByRole('form', { name: 'Novo insumo' });
  await f.getByLabel('Nome do insumo').fill(name);
  await f.getByLabel('Categoria').selectOption({ label: 'Laticínios' });
  await f.getByLabel('Armazenamento').selectOption({ label: 'Refrigerado' });
  await f.getByLabel('Unidade de compra').selectOption({ label: 'L' });
  await f.getByLabel('Densidade (g/mL)').fill('1,03');
  await f.getByLabel('Buscar na TACO').fill('leite de vaca achocolatado');
  await f.getByRole('list', { name: 'Alimentos encontrados' }).getByRole('button').first().click();
  await expect(f.getByText(/Ligado a:/)).toBeVisible();
  await f.getByLabel('Leite', { exact: true }).check();
  await f.getByLabel('Lactose', { exact: true }).check();
  await f.getByRole('button', { name: 'Cadastrar insumo' }).click();

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Alergênicos')).toContainText('Leite');
  await expect(page.getByLabel('Alergênicos')).toContainText('Lactose');
  const pf = page.getByRole('form', { name: 'Registrar preço' });
  await pf.getByLabel('Preço por L (R$)').fill('6,50');
  await pf.getByLabel('Fornecedor').selectOption({ label: supplier });
  await pf.getByRole('button', { name: 'Registrar preço' }).click();
  await expect(page.getByLabel('Preço vigente')).toHaveText(/R\$\s?6,50/, { timeout: 15_000 });
  await expect(page.getByText(/R\$\s?6,31\/kg/)).toBeVisible();
  await expect(page.getByRole('table').getByText(supplier)).toBeVisible();

  // U2b: ficha técnica com o leite — cálculo ao vivo, escalonamento e aprovação
  const insumoUrl = new URL(page.url()).pathname;
  await page.goto('/app/uan');
  await page.getByRole('navigation', { name: 'Cadastros de Consultório de Teste Rafanutri' }).getByRole('link', { name: 'Fichas técnicas' }).click();
  await page.getByRole('button', { name: 'Nova ficha técnica' }).click();
  const nf = page.getByRole('form', { name: 'Nova ficha técnica' });
  const sheetName = `Mingau E2E ${stamp}`;
  await nf.getByLabel('Nome da preparação').fill(sheetName);
  await nf.getByLabel('Porções').fill('4');
  await nf.getByRole('button', { name: 'Criar ficha' }).click();
  await expect(page.getByRole('heading', { level: 1, name: sheetName })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Adicionar ingrediente' }).click();
  await page.getByLabel('Ingrediente 1', { exact: true }).selectOption({ label: name });
  await page.getByLabel('Peso bruto do ingrediente 1').fill('1000');
  await page.getByLabel('Peso pronto (g)').fill('800');
  const calc = page.getByRole('complementary', { name: 'Cálculo da ficha' });
  await expect(calc.getByLabel('Rendimento', { exact: true })).toHaveText('800 g');
  await expect(calc.getByLabel('Porção', { exact: true })).toHaveText('200 g');
  await expect(calc.getByLabel('Custo total', { exact: true })).toHaveText(/R\$\s?6,31/);
  await expect(calc.getByLabel('Alergênicos da ficha')).toContainText('Leite');
  await expect(calc.getByRole('rowheader', { name: 'Energia' })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo.' })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Escalar para').fill('8');
  await page.getByRole('button', { name: 'Escalar' }).click();
  await expect(page.getByLabel('Peso bruto do ingrediente 1')).toHaveValue('2000');
  await expect(calc.getByLabel('Rendimento', { exact: true })).toHaveText('1.600 g');
  await expect(calc.getByLabel('Porção', { exact: true })).toHaveText('200 g');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Aprovar ficha' }).click();
  await expect(page.getByText('Aprovada', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Nova versão' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar rascunho' })).toHaveCount(0);

  // U7: rótulo nutricional da ficha aprovada
  const lf = page.getByRole('form', { name: 'Dados do rótulo' });
  await lf.getByLabel('Medida caseira').fill('1 copo');
  await lf.getByLabel(/Açúcares totais/).fill('9');
  await expect(page.getByRole('img', { name: 'Pré-visualização do rótulo nutricional' })).toBeVisible();
  await lf.getByRole('button', { name: 'Emitir rótulo' }).click();
  await expect(lf.getByRole('status')).toHaveText('Rótulo emitido.', { timeout: 15_000 });
  const issued = page.getByRole('list', { name: 'Rótulos emitidos' });
  await expect(issued).toContainText('(1 copo)');
  const [labelPdf] = await Promise.all([page.waitForEvent('download'), issued.getByRole('link', { name: 'PDF' }).first().click()]);
  expect(labelPdf.suggestedFilename()).toMatch(/^rotulo-.*\.pdf$/);

  // U2c: cardápio com a ficha aprovada, teto de custo, envio com justificativa e aprovação
  await page.goto('/app/uan');
  await page.getByRole('button', { name: 'Nova unidade' }).click();
  const uf = page.getByRole('form', { name: 'Nova unidade' });
  const unitName = `Cardápio E2E ${stamp}`;
  await uf.getByLabel('Nome da unidade').fill(unitName);
  await uf.getByRole('button', { name: 'Criar unidade' }).click();
  await expect(page.getByRole('heading', { level: 1, name: unitName })).toBeVisible({ timeout: 15_000 });
  const unitUrl = new URL(page.url()).pathname;
  try {
    await page.getByRole('link', { name: 'Cardápios da unidade' }).click();
    await page.getByRole('button', { name: 'Novo cardápio' }).click();
    const cf = page.getByRole('form', { name: 'Novo cardápio' });
    await cf.getByLabel('Nome do cardápio').fill('Semana E2E');
    await cf.getByLabel('Começa em').fill(new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10));
    await cf.getByLabel('Ciclo').selectOption('7');
    await cf.getByLabel('Teto de custo por refeição (R$, opcional)').fill('0,10');
    await cf.getByRole('button', { name: 'Criar cardápio' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Semana E2E' })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Prato principal do dia 1').selectOption({ label: sheetName });
    await expect(page.getByRole('row').filter({ hasText: 'Dia 1' }).getByText(/do teto/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Enviar para aprovação' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'acima do teto de custo' })).toBeVisible();
    await page.getByLabel('Observação ou justificativa').fill('Teto baixo de propósito no teste automatizado');
    await page.getByRole('button', { name: 'Enviar para aprovação' }).click();
    await expect(page.getByText('Enviado para aprovação', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Aprovar cardápio' }).click();
    await expect(page.getByText('Aprovado', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await page.goto(unitUrl);
    await expect(page.getByRole('list', { name: 'Almoço de hoje' })).toContainText(sheetName, { timeout: 15_000 });

    // U3a: produção do dia — comensais, lista de preparo, requisição e desperdício
    await page.getByRole('link', { name: 'Produção e desperdício' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Produção do dia' })).toBeVisible({ timeout: 15_000 });
    const din = page.getByRole('form', { name: 'Comensais do Almoço' });
    await din.getByLabel('Previstos').fill('10');
    await din.getByLabel('Realizados').fill('8');
    await din.getByRole('button', { name: 'Salvar comensais do Almoço' }).click();
    await expect(page.getByLabel(`Porções de ${sheetName}`)).toHaveText('10', { timeout: 15_000 });
    await expect(page.getByLabel(`Peso bruto de ${name}`)).toBeVisible();
    const wf = page.getByRole('form', { name: `Pesagem de ${sheetName}` });
    await wf.getByLabel('Produzido (kg)').fill('1');
    await wf.getByLabel('Sobra limpa (kg)').fill('0,04');
    await wf.getByLabel('Porções servidas').fill('8');
    await wf.getByRole('button', { name: 'Salvar' }).click();
    await expect(wf.getByRole('status')).toHaveText('Pesagem salva.', { timeout: 15_000 });
    const rf = page.getByRole('form', { name: 'Pesagem de Resto das bandejas' });
    await rf.getByLabel('Resto-ingesta das bandejas (kg)').fill('0,08');
    await rf.getByLabel('Motivo').selectOption({ label: 'Sabor' });
    await rf.getByRole('button', { name: 'Salvar' }).click();
    const ind = page.getByLabel('Indicadores do Almoço');
    await expect(ind).toContainText('4%', { timeout: 15_000 });
    await expect(ind).toContainText('8,3%');
    await expect(ind).toContainText('10 g');

    // U4a: estoque — entradas, alerta de validade, saída FEFO e inventário
    await page.goto(unitUrl);
    await page.getByRole('link', { name: 'Estoque', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Estoque' })).toBeVisible({ timeout: 15_000 });
    const plusDays = (n: number) => new Date(Date.now() - 3 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
    const entrada = page.getByRole('form', { name: 'Entrada no estoque' });
    for (const [qty, exp, lot] of [['2', plusDays(2), 'L-A'], ['1', plusDays(10), 'L-B']] as const) {
      await entrada.getByLabel('Insumo').selectOption({ label: name });
      await entrada.getByLabel(/^Quantidade/).fill(qty);
      await entrada.getByLabel('Validade').fill(exp);
      await entrada.getByLabel('Lote').fill(lot);
      await entrada.getByRole('button', { name: 'Registrar entrada' }).click();
      await expect(entrada.getByRole('status')).toHaveText('Entrada registrada.', { timeout: 15_000 });
    }
    await expect(page.getByLabel(`Saldo de ${name}`)).toHaveText('3 L');
    await expect(page.getByRole('list', { name: 'Alertas do estoque' })).toContainText('vencendo em até 3 dias');
    const saida = page.getByRole('form', { name: 'Saída do estoque' });
    await saida.getByLabel('Insumo').selectOption({ index: 1 });
    await saida.getByLabel(/^Quantidade/).fill('1');
    await saida.getByRole('button', { name: 'Registrar saída' }).click();
    await expect(saida.getByRole('status')).toContainText('Saída registrada', { timeout: 15_000 });
    await expect(page.getByLabel(`Saldo de ${name}`)).toHaveText('2 L');
    await page.getByRole('button', { name: 'Abrir inventário' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Inventário' })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(`Contagem de ${name} (L)`).fill('1,5');
    await page.getByLabel(`Motivo de ${name}`).fill('Contagem física');
    await page.getByLabel(`Motivo de ${name}`).blur();
    await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Salvo', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Aprovar inventário' }).click();
    await expect(page.getByText('Inventário aprovado: os ajustes foram lançados no estoque.')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: /← Estoque de/ }).click();
    await expect(page.getByLabel(`Saldo de ${name}`)).toHaveText('1,5 L', { timeout: 15_000 });

    // U4b: compras — necessidade do dia, pedido por fornecedor, envio e recebimento com recusa por temperatura
    await page.goto(unitUrl);
    await page.getByRole('link', { name: 'Compras', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Compras' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(`Comprar ${name}`)).toBeVisible();
    await page.getByRole('button', { name: /Gerar \d+ pedido/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'em rascunho' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('list', { name: 'Pedidos de compra' }).getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1, name: /^Pedido/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Marcar como enviado' }).click();
    const rc = page.getByRole('form', { name: 'Recebimento' });
    await expect(rc).toBeVisible({ timeout: 15_000 });
    await rc.getByLabel('Nota fiscal').fill('NF E2E');
    await rc.getByLabel('Temperatura (°C)').first().fill('12');
    await expect(rc.getByText(/acima do limite de 7 °C/)).toBeVisible();
    await rc.getByLabel(/Motivo da recusa/).fill('Chegou quente');
    await rc.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect(page.getByRole('region', { name: 'Recebimentos' })).toContainText('recusado — Chegou quente', { timeout: 15_000 });

    // U5: custos — planejado × realizado e curva ABC do consumo
    await page.goto(unitUrl);
    await page.getByRole('link', { name: 'Custos', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Custos' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Custo por refeição planejado')).toHaveText(/R\$/);
    await expect(page.getByLabel('Custo por refeição realizado')).toHaveText(/R\$/);
    await expect(page.getByRole('region', { name: 'Curva ABC do consumo' })).toContainText(name);

    // U5: painel da rede e relatório mensal da unidade
    await page.goto('/app/uan/rede');
    await expect(page.getByRole('heading', { level: 1, name: 'Painel da rede' })).toBeVisible({ timeout: 20_000 });
    const netRow = page.getByRole('table', { name: 'Indicadores por unidade' }).getByRole('row').filter({ hasText: unitName });
    await expect(netRow).toContainText('R$');
    const [monthly] = await Promise.all([page.waitForEvent('download'), netRow.getByRole('link', { name: 'Relatório' }).click()]);
    expect(monthly.suggestedFilename()).toMatch(/^relatorio-cardapio-e2e-\d+-\d{4}-\d{2}\.pdf$/);

    // U7: cardápio público com alergênicos e pesquisa de satisfação por prato
    await page.goto(`${unitUrl}/cardapio-publico`);
    await page.getByRole('button', { name: 'Publicar cardápio' }).click();
    const link = page.getByRole('link', { name: /\/cardapio\// });
    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('img', { name: 'QR Code do cardápio' })).toBeVisible();
    await page.getByRole('form', { name: 'Pesquisa de satisfação' }).getByRole('button', { name: 'Abrir pesquisa' }).click();
    await expect(page.getByRole('button', { name: 'Encerrar pesquisa' })).toBeVisible({ timeout: 15_000 });
    const publicUrl = (await link.getAttribute('href'))!;
    const guest = await page.context().browser()!.newPage();
    await guest.goto(publicUrl);
    const dishCard = guest.getByRole('listitem').filter({ hasText: sheetName });
    await expect(dishCard).toBeVisible({ timeout: 15_000 });
    await expect(dishCard.getByLabel('Alergênicos')).toContainText('Leite');
    await dishCard.getByRole('button', { name: 'Avaliar prato' }).click();
    const rate = guest.getByRole('form', { name: `Avaliar ${sheetName}` });
    await rate.getByRole('radio', { name: '4 estrelas' }).click();
    await rate.getByRole('button', { name: 'Sim' }).click();
    await rate.getByRole('button', { name: 'Enviar' }).click();
    await expect(guest.getByRole('status').filter({ hasText: 'Obrigado pela avaliação!' })).toBeVisible({ timeout: 15_000 });
    await guest.goto(`${publicUrl}/tv`);
    await expect(guest.getByText(sheetName).first()).toBeVisible();
    await guest.close();
    await page.reload();
    await expect(page.getByRole('table', { name: 'Satisfação por prato' })).toContainText(sheetName);
  } finally {
    await page.goto(unitUrl);
    const ue = page.getByRole('form', { name: 'Dados da unidade' });
    await ue.getByLabel(/Unidade ativa/).uncheck();
    await ue.getByRole('button', { name: 'Salvar unidade' }).click();
    await expect(ue.getByRole('status')).toHaveText('Unidade salva.', { timeout: 15_000 });
  }
  await page.goto(insumoUrl);

  // fora de uso (não acumula)
  const edit = page.getByRole('form', { name: 'Dados do insumo' });
  await edit.getByLabel('Insumo em uso').uncheck();
  await edit.getByRole('button', { name: 'Salvar insumo' }).click();
  await expect(edit.getByRole('status')).toHaveText('Insumo salvo.', { timeout: 15_000 });
  await page.getByRole('link', { name: '← Insumos' }).click();
  await expect(page.getByRole('row').filter({ hasText: name }).getByText('Fora de uso')).toBeVisible();
  await page.getByRole('link', { name: 'Fornecedores' }).first().click();
  await page.getByRole('list', { name: 'Fornecedores' }).getByRole('listitem').filter({ hasText: supplier }).getByRole('button', { name: `Editar ${supplier}` }).click();
  const se = page.getByRole('form', { name: `Dados de ${supplier}` });
  await se.getByLabel('Fornecedor ativo').uncheck();
  await se.getByRole('button', { name: 'Salvar fornecedor' }).click();
  await expect(page.getByRole('list', { name: 'Fornecedores' }).getByRole('listitem').filter({ hasText: supplier }).getByText('Inativo')).toBeVisible({ timeout: 15_000 });
});
