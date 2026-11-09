import { defineConfig } from 'vitest/config';

// Testes unitários: não dependem de Docker. Os de integração estão em vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['src/**/*.int.test.ts'],
  },
});
