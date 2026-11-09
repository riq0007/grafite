import '@grafite/ui/fontes.css';
import '@grafite/ui/tokens.css';
import '@grafite/ui/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { abrirSessao, apiDoServidor } from './api/servidor.ts';

// A sessão abre antes da primeira tela, com o código do endereço que o comando abriu.
const raiz = document.getElementById('raiz');
if (raiz) {
  const sessao = await abrirSessao();
  createRoot(raiz).render(
    <StrictMode>
      <App api={apiDoServidor()} sessaoRecusada={sessao === 'recusada'} />
    </StrictMode>,
  );
}
