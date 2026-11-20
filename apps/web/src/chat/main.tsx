// A entrada do app do chat (change chat-com-chamados, design, decisão 12), na página própria do
// build. Não importa o roteador da casca nem os módulos: o colaborador abre o chat no celular, e
// o pacote da casca passa de 2 MiB. Não tem a chegada: a sessão é validada como na etapa da
// sessão dela, sem a camada do carregamento, e a tela fica vazia até a resposta.
import '@grafite/ui/fontes.css';
import '@grafite/ui/tokens.css';
import '@grafite/ui/base.css';
import { registerSW } from 'virtual:pwa-register';
import { ligarBarraDeRolagem } from '@grafite/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { criarCanalDeEventos } from '../eventos/canal.ts';
import { criarConexaoDeEventos } from '../eventos/conexao.ts';
import { registrarServiceWorker } from '../pwa/versaoNova.ts';
import { criarLojaDaSessao } from '../sessao/loja.ts';
import { AppDoChat } from './AppDoChat.tsx';
import { criarRoteadorDoChat } from './rotas.tsx';

ligarBarraDeRolagem(document);

const raiz = document.getElementById('raiz');
if (raiz) {
  const sessao = criarLojaDaSessao();
  const consultas = criarClienteDeConsultas();
  const canal = criarCanalDeEventos();
  const conexao = criarConexaoDeEventos({
    loja: sessao,
    canal,
    aoReiniciar: () => void consultas.invalidateQueries(),
  });
  conexao.ligar();
  createRoot(raiz).render(
    <StrictMode>
      <AppDoChat
        roteador={criarRoteadorDoChat()}
        sessao={sessao}
        consultas={consultas}
        canal={canal}
      />
    </StrictMode>,
  );
  void sessao.validar();
}

// O mesmo service worker do Grafite: o push chega a quem só usa o chat, e a versão nova espera.
registrarServiceWorker({ registrar: registerSW });
