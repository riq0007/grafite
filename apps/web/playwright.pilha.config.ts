import { defineConfig, devices } from '@playwright/test';
import { portaDaPilha } from './src/teste/portas.ts';

// A ponta a ponta da pilha inteira (design do F2a, decisão 16): o PostgreSQL de verdade, as
// migrations, o comando no servidor e a API servindo a web compilada, sem nada simulado. O
// e2e-pilha/subir.ts sobe tudo antes e derruba no fim. A porta é da instância do executor (change
// ci-paralelo, design, decisão 1): 4174 sem a variável, e o coletor usa a seguinte.
export const PORTA_DA_PILHA = portaDaPilha();

export default defineConfig({
  testDir: 'e2e-pilha',
  // O log da API fica fora daqui (test-results/api-da-pilha.log), que o Playwright limpa.
  outputDir: 'test-results/pilha',
  reporter: [['list']],
  // Um caminho só, em ordem, sobre o mesmo banco.
  workers: 1,
  // O caminho cresce a cada subprojeto: com a ficha do ativo (P1d), passa de 1,5 min no CI, e com
  // as contagens dos locais (relacoes-vivas), passa de 2,5 min no executor próprio.
  timeout: 300_000,
  globalSetup: './e2e-pilha/subir.ts',
  use: { baseURL: `http://localhost:${PORTA_DA_PILHA}`, serviceWorkers: 'block' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
