import { defineConfig } from 'vitest/config';

// Os testes da página, contra o servidor simulado em memória. Os de ponta a ponta (e2e/) são do
// Playwright, contra o servidor simulado de verdade.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'simulado/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['src/teste/preparar.ts'],
    testTimeout: 30_000,
  },
});
