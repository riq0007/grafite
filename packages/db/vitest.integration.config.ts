import { defineConfig } from 'vitest/config';

// Testes com PostgreSQL real (exigem Docker). Os unitários ficam em vitest.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['test/banco-global.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
