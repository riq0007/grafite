import { defineConfig, devices } from '@playwright/test';

// As pontas a ponta do painel (change painel-da-operacao, design, decisão 10): a página compilada,
// servida pelo servidor do painel de verdade, com o servidor de mentira do simulado/dominio.ts. Cada
// teste abre o seu servidor numa porta livre do 127.0.0.1, com o código de sessão dele, e por isso
// não há porta fixa nem servidor compartilhado entre os testes.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  globalSetup: './e2e/compilar.ts',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
