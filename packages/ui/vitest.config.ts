import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import {
  apertarTecla,
  porPonteiroSobre,
  tirarPonteiroDaPagina,
} from './.storybook/comandos-do-navegador.ts';

const pasta = dirname(fileURLToPath(import.meta.url));

// Dois projetos: "unitario" (happy-dom, rápido) e "catalogo" (cada história do Storybook
// vira um teste no Chromium, com interações e checagem de acessibilidade).
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unitario',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'happy-dom',
          // Com a suíte inteira rodando junto no executor carregado, rasterizar os derivados da
          // marca passa dos 5 s do padrão (change testes-sob-carga).
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        plugins: [storybookTest({ configDir: join(pasta, '.storybook') })],
        test: {
          name: 'catalogo',
          browser: {
            enabled: true,
            headless: true,
            // O Playwright abre o Chromium com as barras de rolagem escondidas. O catálogo testa com
            // elas à vista, como no computador de quem usa: a barra própria reserva os 12 px dela, e
            // as histórias medem a área que sobra (change barra-de-rolagem-propria).
            provider: playwright({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } }),
            instances: [{ browser: 'chromium' }],
            commands: { apertarTecla, porPonteiroSobre, tirarPonteiroDaPagina },
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
          // Cada história pode esperar mais de uma vez os 10 s da Testing Library com o executor
          // carregado (change captura-e-catalogo-sob-carga).
          testTimeout: 30_000,
        },
      },
    ],
  },
});
