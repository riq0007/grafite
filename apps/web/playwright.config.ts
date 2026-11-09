import { defineConfig, devices } from '@playwright/test';
import { portaDoE2e } from './src/teste/portas.ts';

// A porta é da instância do executor (change ci-paralelo, design, decisão 1): 4173 sem a variável.
const porta = portaDoE2e();

// Testes de ponta a ponta contra a web compilada (vite preview), como em produção.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  // Um service worker de um teste não pode servir a web velha a outro, nem passar por fora das
  // rotas simuladas: só as pontas a ponta da PWA o liberam (design do F1c, decisão 10).
  use: { baseURL: `http://localhost:${porta}`, serviceWorkers: 'block' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // O vite direto, sem passar pelo pnpm: o pnpm 12 roda cada script num grupo de processos
    // próprio, e no Linux o Playwright encerra o servidor matando só o grupo que ele criou. O
    // `vite preview` sobrevivia com a saída aberta, e o Playwright esperava por ela para sempre.
    command: `vite build && vite preview --port ${porta} --strictPort`,
    url: `http://localhost:${porta}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
