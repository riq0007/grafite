import { defineConfig } from 'vitest/config';

// Testes com PostgreSQL real (exigem Docker), pela API montada como em produção, com o relógio falso.
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts', 'scripts/**/*.int.test.ts'],
    globalSetup: ['test/banco-global.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
