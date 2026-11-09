import { defineConfig } from 'vitest/config';

// Testes unitários: não dependem de Docker. Os de integração estão em vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/*.int.test.ts'],
    // O primeiro teste de cada arquivo monta o app com todas as rotas, e o do contrato monta a API
    // para gerá-lo: com o executor do CI carregado, passam dos 5 s do padrão (changes
    // ci-no-executor-proprio e testes-sob-carga).
    testTimeout: 30_000,
  },
});
