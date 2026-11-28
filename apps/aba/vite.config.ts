import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A tela da aba (change aba-dos-colaboradores, design, decisão 1): arquivos estáticos que o Tauri
// embute no programa. A tela não fala com a rede, só com os comandos do lado nativo. No `tauri dev`,
// o Tauri abre este servidor, na porta fixa do `devUrl`, e o Rust se recompila sozinho: o Vite não
// olha o lado nativo nem o que o Cargo compila.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // Duas páginas, uma por janela: a aba e a moldura da tela maior.
    rollupOptions: {
      input: {
        aba: fileURLToPath(new URL('index.html', import.meta.url)),
        maior: fileURLToPath(new URL('maior.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5176,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/servico/**', '**/target/**'] },
  },
});
