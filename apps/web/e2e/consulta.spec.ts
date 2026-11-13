import { expect, test, type Page } from '@playwright/test';

// RN-037 — Fluxo completo de uma consulta, contra o ambiente real (E2E_BASE_URL) com o usuário de teste:
// cadastrar paciente → agendar → enviar anamnese → responder pelo link → avaliar → metas de energia →
// montar plano com substituição → publicar → gerar PDF → registrar, assinar e retificar a evolução.
// Cria um paciente novo por execução e o arquiva no fim (não ocupa vaga do plano gratuito). As evoluções
// assinadas e o plano publicado ficam no paciente arquivado (são imutáveis por regra).
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

async function login(page: Page) {
  await page.goto('/login?next=/app/pacientes');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\/pacientes$/);
}

test.describe.configure({ mode: 'serial' });

test('consulta de ponta a ponta', async ({ page }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD (usuário de teste com consultório).');
  test.setTimeout(300_000);
  page.on('dialog', (d) => void d.accept());
  const started = Date.now();
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const name = `Paciente E2E ${stamp}`;
  let patientUrl = '';
  let appointmentDate = '';

  try {
    await test.step('login e cadastro do paciente', async () => {
      await login(page);
      await page.getByRole('button', { name: /Novo paciente/ }).click();
      const form = page.getByRole('form', { name: 'Novo paciente' });
      await form.getByLabel('Nome completo').fill(name);
      await form.getByLabel('Data de nascimento (opcional)').fill('1990-05-20');
      await form.getByLabel('Sexo (opcional)').selectOption('female');
      await form.getByLabel('Celular (opcional)').fill('(31) 99999-0000');
      await form.getByRole('button', { name: 'Salvar paciente' }).click();
      await page.getByRole('link', { name }).first().click();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      patientUrl = page.url();
    });

    await test.step('marcar a consulta', async () => {
      await page.getByRole('link', { name: 'Marcar consulta' }).first().click();
      const form = page.getByRole('form', { name: 'Nova consulta' });
      await expect(form.getByLabel('Paciente')).toHaveValue(patientUrl.split('/').pop()!);
      await form.getByLabel('Tipo').selectOption({ label: 'Primeira consulta' });
      // Primeiro dia (a partir de amanhã) com horário livre. Computador e celular rodam em paralelo na
      // mesma conta: um pega o último horário e o outro o primeiro, para não disputarem o mesmo.
      const slots = form.getByRole('group', { name: 'Horários livres' }).getByRole('button');
      for (let d = 1; d <= 30; d += 1) {
        appointmentDate = new Date(Date.now() - 3 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);
        await form.getByLabel('Data').fill(appointmentDate);
        if (await slots.first().isVisible()) break;
      }
      await (test.info().project.name === 'mobile' ? slots.first() : slots.last()).click();
      await form.getByRole('button', { name: 'Marcar consulta' }).click();
      await expect(form).toBeHidden();
      await expect(page.getByRole('main').getByText(name).first()).toBeVisible();
    });

    await test.step('enviar a anamnese e responder pelo link', async () => {
      await page.goto(`${patientUrl}/anamneses`);
      await page.getByLabel('Questionário').selectOption({ label: 'Anamnese clínica (adulto) (padrão)' });
      await page.getByRole('button', { name: /Gerar link/ }).click();
      const link = await page.getByLabel('Link da anamnese').inputValue();
      expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{43}$/);

      const pub = await page.context().newPage();
      await pub.goto(link);
      await expect(pub.getByRole('heading', { level: 1, name: 'Olá, Paciente!' })).toBeVisible();
      await pub.getByRole('radio', { name: 'Emagrecimento' }).click();
      await pub.getByRole('radiogroup', { name: /medicamento/ }).getByRole('radio', { name: 'Não' }).click();
      await pub.getByLabel(/Alergias ou intolerâncias/).fill('Intolerância à lactose');
      await pub.getByRole('radio', { name: '1 a 2 vezes por semana' }).click();
      await pub.getByLabel(/Quantas refeições/).fill('5');
      await pub.getByRole('button', { name: 'Enviar respostas' }).click();
      await expect(pub.getByText(/Respostas enviadas|Obrigad/).first()).toBeVisible();
      await pub.close();

      await page.reload();
      await expect(page.getByText(/Respondida/).first()).toBeVisible();
      // Alergia em destaque no cabeçalho da ficha
      await expect(page.getByText('Intolerância à lactose').first()).toBeVisible();
    });

    await test.step('avaliação antropométrica', async () => {
      await page.goto(`${patientUrl}/avaliacoes`);
      const form = page.getByRole('form', { name: 'Nova avaliação antropométrica' });
      await form.getByLabel('Peso (kg)').fill('72,4');
      await form.getByLabel('Altura (cm)').fill('165');
      await form.getByLabel('Cintura (cm)').fill('80');
      await form.getByRole('button', { name: 'Salvar avaliação' }).click();
      await expect(page.getByText(/72,4/).first()).toBeVisible();
    });

    await test.step('plano com metas, substituição e publicação', async () => {
      await page.goto(`${patientUrl}/planos`);
      await page.getByRole('button', { name: 'Novo plano' }).click();
      await expect(page).toHaveURL(/\/planos\/[0-9a-f-]{36}$/);
      // Metas calculadas a partir da avaliação (peso e altura)
      const goals = page.getByRole('region', { name: 'Gasto energético e metas' });
      await expect(goals.getByText(/kcal/).first()).toBeVisible();

      const meal = page.locator('section[aria-labelledby^="meal-"]').first();
      const search = meal.getByLabel('Buscar alimento');
      await search.fill('arroz');
      await meal.getByRole('option').first().click();
      await meal.getByRole('button', { name: /Substituições/ }).first().click();
      await meal.getByRole('button', { name: 'Adicionar' }).first().click();
      await expect(meal.getByRole('button', { name: /Substituições \(1\)/ })).toBeVisible();

      await page.getByRole('button', { name: 'Salvar rascunho' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Rascunho salvo.' })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Publicar para o paciente' }).click();
      await expect(page.getByRole('button', { name: 'Publicado' })).toBeVisible();
    });

    await test.step('gerar o PDF do plano', async () => {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Baixar PDF' }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/\.pdf$/);
    });

    await test.step('evolução: assinar e retificar', async () => {
      await page.goto(`${patientUrl}/prontuario`);
      await page.getByLabel('Nova evolução').fill('Primeira consulta. Paciente com **boa disposição**.\n- Plano entregue');
      await page.getByRole('button', { name: /Salvar e assinar/ }).click();
      const card = page.getByRole('listitem').filter({ hasText: 'boa disposição' });
      await expect(card.getByText(/Assinada por/)).toBeVisible();
      await expect(card.getByRole('button', { name: 'Editar' })).toHaveCount(0);

      await card.getByRole('button', { name: 'Retificar' }).click();
      await card.getByLabel(/Retificação/).fill('Primeira consulta. Paciente com **boa disposição** e queixa de inchaço.\n- Plano entregue');
      await card.getByRole('button', { name: /Salvar e assinar/ }).click();
      const fixed = page.getByRole('listitem').filter({ hasText: 'queixa de inchaço' });
      await expect(fixed.getByText('Retificada')).toBeVisible();
      await fixed.getByRole('button', { name: /Ver versões anteriores \(1\)/ }).click();
      await expect(fixed.getByText('Paciente com boa disposição.').first()).toBeVisible();

      // A linha do tempo junta consulta, anamnese, avaliação e plano
      for (const t of [/Primeira consulta ·/, /respondida/, 'Avaliação antropométrica', /Plano publicado/]) {
        await expect(page.getByRole('main').getByText(t).first()).toBeVisible();
      }
    });
  } finally {
    if (appointmentDate) {
      await test.step('cancelar a consulta de teste (libera o horário)', async () => {
        await page.goto(`/app/agenda?semana=${appointmentDate}`);
        const card = page.getByRole('listitem').filter({ hasText: name });
        if (await card.count()) {
          await card.first().getByRole('button', { name: 'Cancelar' }).click();
          await expect(page.getByText(`Consulta de ${name} cancelada.`)).toBeVisible();
        }
      });
    }
    if (patientUrl) {
      await test.step('arquivar o paciente de teste', async () => {
        await page.goto(patientUrl);
        await page.getByRole('button', { name: 'Arquivar' }).click();
        await expect(page.getByRole('button', { name: 'Reativar' })).toBeVisible();
      });
    }
    console.log(`Fluxo completo em ${Math.round((Date.now() - started) / 1000)} s (meta com usuário real: 10 min).`);
  }
});
