import { defineConfig } from 'vitest/config';

// Testes unitários: não dependem de Docker. Os de integração estão em vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.int.test.ts'],
    // Os testes gravam backups, manifestos e zips de verdade no disco. No Windows, com o antivírus
    // olhando cada arquivo e os outros pacotes testando ao lado, passam dos 5 s do padrão.
    testTimeout: 30_000,
  },
});
