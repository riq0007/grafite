import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A tela da aba (change aba-dos-colaboradores, design, decisão 1): arquivos estáticos que o Tauri
// embute no programa. A tela não fala com a rede, só com os comandos do lado nativo. No `tauri dev`,
// o Tauri abre este servidor, na porta fixa do `devUrl`, e o Rust se recompila sozinho: o Vite não
// olha o lado nativo nem o que o Cargo compila.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: {
    port: 5176,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/servico/**', '**/target/**'] },
  },
});
