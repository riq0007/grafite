import '@grafite/ui/fontes.css';
import '@grafite/ui/tokens.css';
import '@grafite/ui/base.css';
import { ligarBarraDeRolagem } from '@grafite/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { abrirSessao, apiDoServidor } from './api/servidor.ts';

// A barra de rolagem própria (spec componentes-base): antes da primeira tela, mede a barra do
// sistema, para valer a dele onde ela é sobreposta, e passa a acompanhar a rolagem.
ligarBarraDeRolagem(document);

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
