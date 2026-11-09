import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A página do painel da operação (change painel-da-operacao, design, decisão 6): arquivos estáticos,
// que o comando de operação serve por uma lista fechada. Sem PWA nem script inline: a página roda
// com a política de conteúdo do servidor do painel, que só aceita o que vem dele.
export default defineConfig({
  plugins: [react()],
  // Nada embutido como data:, nem as fontes pequenas: a política só aceita as fontes vindas dele.
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0 },
  server: { port: 5174, strictPort: true },
});
