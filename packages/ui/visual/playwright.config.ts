// Regressão visual do catálogo. Roda dentro do contêiner oficial do Playwright (pnpm test:visual);
// RAIZ_DO_PACOTE aponta para o pacote de UI montado no contêiner.
import { defineConfig } from '@playwright/test';

const raiz = process.env.RAIZ_DO_PACOTE ?? '..';

export default defineConfig({
  testDir: '.',
  testMatch: 'visual.spec.ts',
  snapshotPathTemplate: `${raiz}/visual/referencias/{arg}{ext}`,
  outputDir: `${raiz}/visual/test-results`,
  fullyParallel: true,
  // 60 s por teste, no lugar dos 30 s do padrão: a espera da história vai a 30 s com o executor do
  // CI carregado, e o teste ainda espera as fontes e compara a captura (change visual-sob-carga).
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:6007', deviceScaleFactor: 1 },
  // 30 s para comparar a captura, no lugar dos 5 s do padrão: com o executor do CI carregado, as
  // fontes, a tela parada e as duas capturas iguais seguidas passam dos 5 s (change
  // integracao-sob-carga).
  expect: { timeout: 30_000, toHaveScreenshot: { animations: 'disabled', caret: 'hide' } },
  webServer: {
    command: 'node servidor.mjs',
    url: 'http://127.0.0.1:6007/index.json',
    env: { PASTA_DO_STORYBOOK: `${raiz}/storybook-static`, PORTA: '6007' },
  },
});
