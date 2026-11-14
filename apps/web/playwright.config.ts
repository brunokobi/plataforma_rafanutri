import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // Movimento reduzido desliga a rolagem suave do site, que faz o clique no celular emulado errar o alvo
  // (os testes da cena animada definem o modo de movimento por conta própria).
  use: { baseURL, trace: 'retain-on-failure', locale: 'pt-BR', actionTimeout: 20_000, navigationTimeout: 30_000, contextOptions: { reducedMotion: 'reduce' }, screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'pnpm start', url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 60_000 },
});
