import { defineConfig } from 'vitest/config';

// Os testes da tela da aba. Os de ponta a ponta (e2e/) são do Playwright, contra a tela compilada,
// com os comandos do Tauri simulados; os do lado nativo e do serviço são do `cargo test`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
  },
});
