import { defineConfig } from 'vitest/config';

// Testes unitários do coletor. Um teste sobe o coletor num processo do Node, e o primeiro da tela de
// saúde monta o Fastify: com o executor do CI carregado, passam dos 5 s do padrão (changes
// ci-no-executor-proprio e testes-sob-carga).
export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
});
