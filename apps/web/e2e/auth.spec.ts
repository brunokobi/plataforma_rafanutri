import { expect, test } from '@playwright/test';

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test('página inicial carrega com chamada para o plano gratuito', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('consultório de nutrição');
  await expect(page.getByRole('link', { name: /Começar grátis/ }).first()).toBeVisible();
});

test('rota protegida redireciona para o login com next', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp/);
});

test('senha errada mostra mensagem neutra', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('ninguem@exemplo.com.br');
  await page.getByLabel('Senha', { exact: true }).fill('senha-errada-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/E-mail ou senha incorretos|Muitas tentativas/)).toBeVisible();
});

test('com prefers-reduced-motion a cena fica estática', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  await expect(page.getByTestId('parallax-scene')).toHaveAttribute('data-reduced-motion', 'true');
});

test('sem prefers-reduced-motion a cena é animada', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/login');
  await expect(page.getByTestId('parallax-scene')).toHaveAttribute('data-reduced-motion', 'false');
});

test('login, sessão httpOnly e logout', async ({ page, context }) => {
  test.skip(!email || !password, 'Defina E2E_USER_EMAIL e E2E_USER_PASSWORD para testar o login real.');
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Bem-vindo/ })).toBeVisible();

  const visibleToJs = await page.evaluate(() => document.cookie);
  expect(visibleToJs).not.toContain('rn_at');
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'rn_at')?.httpOnly).toBe(true);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('cadastro válido em pré-lançamento avisa que nada foi salvo', async ({ page }) => {
  await page.goto('/cadastro');
  await expect(page.getByText('Pré-lançamento')).toBeVisible();
  await page.getByLabel('Nome completo').fill('Ana Souza');
  await page.getByLabel('E-mail').fill('ana@exemplo.com.br');
  await page.getByLabel('Senha', { exact: true }).fill('nutri2026');
  await page.getByLabel('Confirmar senha').fill('nutri2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Criar conta grátis' }).click();
  await expect(page.getByText(/Nenhuma informação foi salva/)).toBeVisible();
});

test('onboarding exige login', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/login\?next=%2Fonboarding/);
});

test('telas do módulo clínico exigem login', async ({ page }) => {
  for (const path of ['/app/pacientes', '/app/pacientes/exemplo/plano', '/app/pacientes/3f6c1e2a-9b7d-4c1e-8a2b-1c2d3e4f5a6b']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});
