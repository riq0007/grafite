// A entrada do app do chat (change chat-com-chamados, design, decisão 12), na página própria do
// build. Não importa o roteador da casca nem os módulos: o colaborador abre o chat no celular, e
// o pacote da casca passa de 2 MiB. Não tem a chegada: a sessão é validada como na etapa da
// sessão dela, sem a camada do carregamento, e a tela fica vazia até a resposta. Dentro da aba
// (change aba-dos-colaboradores, decisão 8), a página entra pelo bilhete ou pela marca da aba e fala
// com ela pela navegação (`naAba.ts`).
import '@grafite/ui/fontes.css';
import '@grafite/ui/tokens.css';
import '@grafite/ui/base.css';
import { registerSW } from 'virtual:pwa-register';
import { ligarBarraDeRolagem, ligarGuardaDoSoltar } from '@grafite/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { criarCanalDeEventos } from '../eventos/canal.ts';
import { criarConexaoDeEventos } from '../eventos/conexao.ts';
import { registrarServiceWorker } from '../pwa/versaoNova.ts';
import { criarLojaDaSessao, type LojaDaSessao } from '../sessao/loja.ts';
import { AppDoChat } from './AppDoChat.tsx';
import { FalhaDaEntradaPelaAba } from './FalhaDaEntradaPelaAba.tsx';
import { entrarPeloBilhete, lerEntradaPelaAba, ligarCanalDaAba } from './naAba.ts';
import { criarRoteadorDoChat } from './rotas.tsx';

ligarBarraDeRolagem(document);
// Como na casca, o arquivo solto fora da conversa, como na lista das conversas, não troca o chat
// pelo arquivo (spec modulo-chat, "Caixa de escrever do chat").
ligarGuardaDoSoltar(window);

const raiz = document.getElementById('raiz');
if (raiz) {
  const pelaAba = lerEntradaPelaAba(window.location);
  const sessao = criarLojaDaSessao(pelaAba?.tipo === 'marca' ? { marcaDaAba: pelaAba.marca } : {});
  const consultas = criarClienteDeConsultas();
  const canal = criarCanalDeEventos();
  const conexao = criarConexaoDeEventos({
    loja: sessao,
    canal,
    aoReiniciar: () => void consultas.invalidateQueries(),
  });
  conexao.ligar();
  const ir = (endereco: string) => window.location.assign(endereco);
  ligarCanalDaAba({ loja: sessao, ir, janela: window });
  const raizDoReact = createRoot(raiz);
  // O roteador nasce depois da entrada pelo bilhete, já no endereço do destino.
  const desenhar = () =>
    raizDoReact.render(
      <StrictMode>
        <AppDoChat
          roteador={criarRoteadorDoChat()}
          sessao={sessao}
          consultas={consultas}
          canal={canal}
        />
      </StrictMode>,
    );
  if (pelaAba?.tipo === 'bilhete') {
    void entrarPeloBilhete(sessao, pelaAba.bilhete, {
      trocarOEndereco: (endereco) => window.history.replaceState(null, '', endereco),
      ir,
      guardado: window.sessionStorage,
    }).then((resultado) => {
      if (resultado.tipo === 'entrou') desenhar();
      if (resultado.tipo === 'falhou') {
        raizDoReact.render(<FalhaDaEntradaPelaAba erro={resultado.erro} />);
      }
    });
  } else {
    desenhar();
    if (pelaAba === null) registrarForaDaAba(sessao);
    void sessao.validar();
  }
}

// O mesmo service worker do Grafite: o push chega a quem só usa o chat, e a versão nova espera. O
// chat da aba fica sem ele, sem a instalação do app e sem o push (change aba-dos-colaboradores,
// decisão 8): a página aberta pela aba não o registra, e a recarregada, só fora da sessão da aba.
function registrarForaDaAba(sessao: LojaDaSessao) {
  const desligar = sessao.assinar(() => {
    const estado = sessao.ler();
    if (estado.tipo === 'validando') return;
    desligar();
    if (!('naAba' in estado && estado.naAba)) registrarServiceWorker({ registrar: registerSW });
  });
}
