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
