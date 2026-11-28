import '@grafite/ui/fontes.css';
import '@grafite/ui/tokens.css';
import '@grafite/ui/base.css';
import './janela.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Aba } from './Aba.tsx';

// A tela da aba (change aba-dos-colaboradores, design, decisão 1), dentro da janela do Tauri. Ela
// não fala com a rede: o estado e as ações vêm dos comandos do lado nativo.
const raiz = document.getElementById('raiz');
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <Aba />
    </StrictMode>,
  );
}
