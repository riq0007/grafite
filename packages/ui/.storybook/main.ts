import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  // O catálogo compilado e as capturas ficam dentro do pacote: vigiá-los derrubava o servidor
  // (EBUSY) quando a compilação da regressão visual escrevia enquanto ele estava aberto.
  viteFinal: (vite) => ({
    ...vite,
    server: {
      ...vite.server,
      watch: {
        ...vite.server?.watch,
        ignored: ['**/storybook-static/**', '**/visual/**'],
      },
    },
  }),
};

export default config;
