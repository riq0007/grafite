import { defineConfig, devices } from '@playwright/test';
import { portaDoE2eDaAba } from './e2e/porta.ts';

const porta = portaDoE2eDaAba();

// As pontas a ponta da tela da aba (change aba-dos-colaboradores, design, "Testes"): a tela
// compilada no `vite preview`, sem o Tauri, com os comandos do lado nativo simulados pelo
// `window.__TAURI_INTERNALS__` (`e2e/tauri.ts`). Rodam sem o Rust, como o resto do repositório.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${porta}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // O vite direto, sem o pnpm, como na web: o Playwright encerra o grupo de processos que criou.
    command: `vite build && vite preview --port ${porta} --strictPort`,
    url: `http://localhost:${porta}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
