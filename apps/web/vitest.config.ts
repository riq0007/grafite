import { defineConfig } from 'vitest/config';

// Testes unitários e de componente. Os de ponta a ponta (e2e/) são do Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    // O happy-dom carregaria o endereço de cada iframe, como os dos painéis: nos testes, nada sai
    // para a rede (change painel-de-dashboards).
    environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true } } },
    setupFiles: ['src/teste/preparar.ts'],
    // Com a suíte inteira rodando junto no executor carregado, as telas que montam a casca com a
    // API simulada passam dos 5 s do padrão (change testes-sob-carga). O limite passado ao `it`
    // vale no lugar deste, mesmo menor: um teste só pede o próprio para ter mais tempo (change
    // cadastro-em-etapas-sob-carga).
    testTimeout: 30_000,
  },
});
