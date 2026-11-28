import '@grafite/ui/fontes.css';
import '@grafite/ui/tokens.css';
import '@grafite/ui/base.css';
import '../janela.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TelaMaior } from './TelaMaior.tsx';

// A tela maior da aba (change aba-dos-colaboradores, design, decisão 8): a segunda janela do Tauri,
// embaixo da aba. Esta página é a moldura, local; o chat é o webview remoto que o lado nativo põe
// no lugar que ela informa.
const raiz = document.getElementById('raiz');
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <TelaMaior />
    </StrictMode>,
  );
}
