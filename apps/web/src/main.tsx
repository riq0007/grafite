import '@grafite/ui/fontes.css';
import '@grafite/ui/tokens.css';
import '@grafite/ui/base.css';
import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { criarClienteDeConsultas } from './api/consultas.ts';
import { chegar } from './chegada/chegar.tsx';
import { criarPrazoDoServidor } from './chegada/prazo.ts';
import { criarCanalDeEventos } from './eventos/canal.ts';
import { criarConexaoDeEventos } from './eventos/conexao.ts';
import { etapaDosAlertas } from './notificacoes/etapa.ts';
import { registrarServiceWorker } from './pwa/versaoNova.ts';
import { criarRoteador } from './rotas/arvore.ts';
import { etapaDaSessao } from './sessao/etapa.ts';
import { criarLojaDaSessao } from './sessao/loja.ts';

const raiz = document.getElementById('raiz');
if (raiz) {
  const raizDoReact = createRoot(raiz);
  // A sessão vive fora do React: a chegada a valida, e a primeira tela segue o que ela disser.
  const sessao = criarLojaDaSessao();
  // Os eventos também: a conexão abre com a sessão que vale e publica cada evento no canal.
  const consultas = criarClienteDeConsultas();
  const canal = criarCanalDeEventos();
  const conexao = criarConexaoDeEventos({
    loja: sessao,
    canal,
    aoReiniciar: () => void consultas.invalidateQueries(),
  });
  conexao.ligar();
  // A sessão e os alertas dividem os 5 s que a chegada espera o servidor.
  const prazo = criarPrazoDoServidor();
  void chegar({
    app: (
      <StrictMode>
        <App roteador={criarRoteador()} sessao={sessao} consultas={consultas} canal={canal} />
      </StrictMode>
    ),
    desenhar: (elemento) => raizDoReact.render(elemento),
    camada: document.getElementById('chegada'),
    etapas: [
      etapaDaSessao(sessao, prazo),
      etapaDosAlertas({ loja: sessao, consultas, conexao, prazo }),
    ],
  });
}

// A casca fica guardada para abrir sem rede, e a versão nova espera o usuário escolher.
registrarServiceWorker({ registrar: registerSW });
