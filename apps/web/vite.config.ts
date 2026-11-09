import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { chegadaNoIndex } from './src/chegada/noIndex.ts';

/** Pré-carrega as fontes principais (latin 400/600 e mono 400) no HTML compilado. */
function preloadDeFontes(): Plugin {
  const principais =
    /(instrument-sans-latin-(400|600)-normal|jetbrains-mono-latin-400-normal)-[\w-]+\.woff2$/;
  return {
    name: 'grafite:preload-de-fontes',
    transformIndexHtml: {
      order: 'post',
      handler(_html, contexto) {
        return Object.keys(contexto.bundle ?? {})
          .filter((arquivo) => principais.test(arquivo))
          .map((arquivo) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              href: `/${arquivo}`,
              crossorigin: '',
            },
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

/**
 * A base da PWA (design do F1c, decisão 6): o Workbox gera o service worker, que guarda a web
 * compilada e abre qualquer endereço dela sem rede, pelo index.html. A API e o /health nunca vêm
 * do cache: não há cache em tempo de execução, e a navegação para eles não cai no index.html. A
 * versão nova espera o usuário escolher "Atualizar" (registro no main.tsx), e o manifesto é o do
 * pnpm marca:gerar. No pnpm dev, não há service worker.
 */
function pwa() {
  return VitePWA({
    strategies: 'generateSW',
    registerType: 'prompt',
    injectRegister: false,
    manifest: false,
    devOptions: { enabled: false },
    workbox: {
      // As fontes vão só em woff2, que é o que os navegadores-alvo pedem.
      globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico,webmanifest}'],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/health(\/|$)/],
      cleanupOutdatedCaches: true,
      // O push e o toque nele (change p3c-email-e-push, design, decisão 7), num arquivo próprio.
      importScripts: ['sw-avisos.js'],
      // A abertura sem rede (spec pwa) precisa do pacote principal no cache, e ele passou dos 2 MiB
      // de fábrica do Workbox com os módulos de 28/10: o que fica de fora quebra o build.
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    },
  });
}

export default defineConfig({
  plugins: [react(), preloadDeFontes(), chegadaNoIndex(), pwa()],
  server: {
    port: 5173,
    strictPort: true,
    // Em desenvolvimento a API roda à parte; /api/* vai para ela.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        rewrite: (caminho) => caminho.replace(/^\/api/, ''),
        // A conexão WebSocket do acesso remoto passa pelo mesmo proxy.
        ws: true,
      },
    },
  },
});
