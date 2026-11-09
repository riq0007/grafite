import { defineConfig } from 'vitest/config';

// Testes com o PostgreSQL de verdade, num contêiner (exigem Docker): as ferramentas rodam lá dentro,
// na mesma versão do servidor.
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
