import { defineConfig } from 'vitest/config';

// Testes unitários: as peças do Windows e o PostgreSQL ficam simulados. Os de integração estão em
// vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['src/**/*.int.test.ts'],
    // Os testes montam pacotes e zips de verdade no disco. No Windows, com o antivírus olhando cada
    // arquivo e os outros pacotes testando ao lado, passam dos 5 s do padrão.
    testTimeout: 30_000,
  },
});
