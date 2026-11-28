import { defineConfig } from 'vitest/config';

// Os testes da tela da aba, os dos exemplos do cliente em Rust contra o OpenAPI e os da conferência
// do MSI. Os de ponta a ponta (e2e/) são do Playwright, contra a tela compilada, com os comandos do
// Tauri simulados; os do lado nativo e do serviço são do `cargo test`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'exemplos/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'happy-dom',
  },
});
