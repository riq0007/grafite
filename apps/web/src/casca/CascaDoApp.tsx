import {
  AvisoDoAmbienteDeTeste,
  avisar,
  BotaoDeBusca,
  BuscaGlobal,
  Casca,
  CentralDeNotificacoes,
  CursorSuavizado,
  type NotificacaoDaCentral,
  RegiaoDeAvisos,
  SinoDeNotificacoes,
  useDataHora,
} from '@grafite/ui';
import {
  Outlet,
  rootRouteId,
  useNavigate,
  useRouteContext,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { miniaturasDaConta } from '../api/fotos.ts';
import { useApi } from '../api/useApi.tsx';
import { ContextoDaAberturaDaBusca } from '../busca/abrirBusca.tsx';
import { ContextoDasAcoesDaTela, criarRegistroDasAcoesDaTela } from '../busca/acoesDaTela.tsx';
import type { EntradaDeBusca } from '../busca/tipos.ts';
import { useBusca } from '../busca/useBusca.ts';
import { useChegada } from '../chegada/avisos.tsx';
import { interruptorDe, registroDaConta } from '../modulos/registroDaConta.ts';
import { ouvirAberturaPeloPush } from '../notificacoes/aberturaPeloPush.ts';
import {
  type Notificacao,
  ROTULO_DO_ADIAR,
  temAcoesDoAlerta,
  useNotificacoes,
  useNotificacoesDaCentral,
} from '../notificacoes/useNotificacoes.tsx';
import { usePreferencias } from '../preferencias/usePreferencias.tsx';
import type { BuscaDaRaiz } from '../rotas/raiz.tsx';
import { pagina } from '../sessao/pagina.ts';
import { useAcesso } from '../sessao/useAcesso.ts';
import { useLojaDaSessao, useServidor, useSessao } from '../sessao/useSessao.tsx';
import { ContextoDasAbas, useAbasDoApp } from './abasDoApp.tsx';
import { focarDestino } from './foco.ts';
import { JanelaComAbas } from './JanelaComAbas.tsx';
import { ModuloDesligado } from './ModuloDesligado.tsx';
import { useMenusDinamicos } from './menusDinamicos.ts';
import { moduloAtual, modulosDaCasca } from './modulosDaCasca.ts';
import { ItemDeRede } from './status/ItemDeRede.tsx';
import { Relogio } from './status/Relogio.tsx';

/** O item do menu do usuário que encerra a sessão; os outros navegam. */
const SAIR = 'sair';

/** O menu do usuário com a conta da sessão (spec estrutura-da-casca). */
const ITENS_DA_CONTA = [
  { id: '/ajustes/conta', rotulo: 'Conta' },
  { id: '/ajustes', rotulo: 'Ajustes do Sistema' },
  { id: SAIR, rotulo: 'Sair', separadoAntes: true },
];

/** Nenhum módulo desligado, enquanto o servidor não disse quais são. */
const NENHUM_DESLIGADO: readonly string[] = [];

/** Com a sessão desconhecida (o servidor não respondeu): avatar neutro e só Ajustes do Sistema. */
const ITENS_SEM_CONTA = [{ id: '/ajustes', rotulo: 'Ajustes do Sistema' }];

/** As ações da própria casca na busca, além das que os módulos declaram. */
const ENTRADAS_DA_CASCA: readonly EntradaDeBusca[] = [
  {
    id: 'casca:abrir-notificacoes',
    rotulo: 'Abrir notificações',
    grupo: 'acoes',
    origem: 'declarada',
    palavrasChave: ['central', 'alertas', 'avisos'],
    icone: Bell,
    executar: ({ abrirNotificacoes }) => abrirNotificacoes(),
  },
];

/**
 * A casca do packages/ui ligada ao app (design, decisão 1): os módulos vêm do registro, só com o
 * que a conta pode usar e sem os que a organização desligou, o dock segue as preferências, e
 * escolher um módulo ou um item de menu navega sem recarregar. O endereço de um módulo desligado
 * mostra que ele está desligado, no lugar das telas dele.
 */
export function CascaDoApp() {
  const { modulos: todos } = useRouteContext({ from: rootRouteId });
  const { pode } = useAcesso();
  const servidor = useServidor();
  const desligados = servidor?.modulosDesligados ?? NENHUM_DESLIGADO;
  const registro = useMemo(
    () => registroDaConta(todos, pode, desligados),
    [todos, pode, desligados],
  );
  const { preferencias, mudar } = usePreferencias();
  const { telaDesenhada } = useChegada();
  // A casca desenhada é uma espera da chegada: a de "Pronto", ou a do fim da entrada.
  useEffect(() => telaDesenhada('casca'), [telaDesenhada]);
  const navegar = useNavigate();
  const idsDasRotas = useRouterState({
    select: (estado) => estado.matches.map((rota) => rota.routeId),
  });
  // O caminho é a chave da tela da primeira aba: outra tela volta a rolagem ao começo.
  const caminho = useRouterState({ select: (estado) => estado.location.pathname });
  // O dock com os itens de menu que vêm dos dados, como as visões fixadas.
  const doDock = useMenusDinamicos(registro, pode);
  const { modulos, modulosDoFim } = useMemo(() => modulosDaCasca(doDock), [doDock]);
  // O módulo do endereço sai do registro inteiro: a barra diz onde se está, mesmo sem permissão.
  const atual = moduloAtual(todos, idsDasRotas);
  // O módulo que liga e desliga o atual: ele mesmo ou, para o que é parte de outro, o dono, cujo
  // nome a tela do módulo desligado mostra (change gestao-de-ativos).
  const interruptor =
    atual && (todos.find((modulo) => modulo.id === interruptorDe(atual)) ?? atual);
  const menusDaBarra = [...modulos, ...modulosDoFim].find(
    (modulo) => modulo.id === atual?.id,
  )?.menusDaBarra;
  useFocoNoTituloAoNavegar();
  const abas = useAbasDoApp();

  // O id de um item que navega é o próprio destino, conferido contra as rotas no registro. O
  // destino com a busca do endereço, como a visão da tabela, vai inteiro.
  // A navegação pelo dock, pela busca e pelos menus leva à primeira aba, a da tela, e as de
  // cadastro continuam abertas (change cadastro-em-abas).
  const irPara = (destino: string, foco?: string) => {
    abas.irParaATela();
    return destino.includes('?')
      ? navegar({ href: destino })
      : navegar({ to: destino, ...(foco ? { search: { foco } } : {}) });
  };

  // O toque no push com o Grafite aberto: o service worker pede o endereço, e a casca o abre.
  useEffect(
    () =>
      ouvirAberturaPeloPush(
        typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
        (destino) => void navegar({ href: destino }),
      ),
    [navegar],
  );

  const [buscaAberta, definirBuscaAberta] = useState(false);
  const [termo, definirTermo] = useState('');
  /** A busca abre sempre vazia (spec busca-global). */
  const mudarBuscaAberta = (aberta: boolean) => {
    if (aberta) definirTermo('');
    definirBuscaAberta(aberta);
  };
  // O campo do topo do Início abre a mesma busca (change inicio-ajustavel).
  const abrirABusca = useCallback(() => {
    definirTermo('');
    definirBuscaAberta(true);
  }, []);
  const notificacoes = useNotificacoes();
  const [centralAberta, definirCentralAberta] = useState(false);
  const daCentral = useNotificacoesDaCentral(centralAberta);
  const { formatarHora } = useDataHora();
  /** A notificação da central ou das recentes, pelo id que a central devolve. */
  const notificacaoDe = (id: string) =>
    daCentral.notificacoes.find((notificacao) => notificacao.id === id) ??
    notificacoes.recentes.find((notificacao) => notificacao.id === id);
  const comNotificacao = (acao: (notificacao: Notificacao) => void) => (id: string) => {
    const notificacao = notificacaoDe(id);
    if (notificacao) acao(notificacao);
  };

  const sessao = useSessao();
  const loja = useLojaDaSessao();
  const conta = sessao.tipo === 'ativa' ? sessao.conta : null;
  /** Sair encerra a sessão e recarrega a página, que recomeça sem nada da conta na memória. */
  const sair = async () => {
    const resultado = await loja.sair();
    if ('erro' in resultado) avisar({ situacao: 'atencao', titulo: resultado.erro });
    else pagina.recarregar();
  };

  const api = useApi();
  // As ações da tela aberta, que a busca mostra em "Nesta tela", lidas quando ela abre.
  const [acoesDaTela] = useState(criarRegistroDasAcoesDaTela);
  const busca = useBusca({
    registro,
    api,
    entradasDaCasca: ENTRADAS_DA_CASCA,
    acoesDaTela: buscaAberta ? acoesDaTela.ler() : undefined,
    aberta: buscaAberta,
    termo,
    contexto: {
      navegar: irPara,
      mudarPreferencias: mudar,
      abrirNotificacoes: () => definirCentralAberta(true),
    },
  });

  return (
    <ContextoDasAbas.Provider value={abas}>
      <ContextoDaAberturaDaBusca.Provider value={abrirABusca}>
        <ContextoDasAcoesDaTela.Provider value={acoesDaTela}>
          <Casca
            barra={{
              modulo: atual?.nome ?? '',
              menus: menusDaBarra,
              aoEscolherItem: (_menu, destino) => irPara(destino),
              status: (
                <>
                  {servidor?.ambiente === 'teste' && <AvisoDoAmbienteDeTeste />}
                  <BotaoDeBusca aoAbrir={() => mudarBuscaAberta(true)} />
                  <ItemDeRede />
                  <SinoDeNotificacoes
                    naoLidas={notificacoes.naoLidas}
                    foco={preferencias.notificacoes.foco}
                    aoAbrir={() => definirCentralAberta(true)}
                  />
                  <Relogio />
                </>
              ),
              usuario: conta
                ? {
                    nome: conta.nome,
                    imagens: miniaturasDaConta(conta.foto),
                    itens: ITENS_DA_CONTA,
                    aoEscolherItem: (id) => (id === SAIR ? void sair() : irPara(id)),
                  }
                : { itens: ITENS_SEM_CONTA, aoEscolherItem: irPara },
            }}
            dock={{
              modulos,
              modulosDoFim,
              atual: atual?.id ?? null,
              // Campo a campo: as preferências do dock também trazem a lista dos módulos, que não é
              // uma propriedade do dock (change dock-personalizavel).
              posicao: preferencias.dock.posicao,
              tamanho: preferencias.dock.tamanho,
              ampliar: preferencias.dock.ampliar,
              ocultar: preferencias.dock.ocultar,
              aoAbrirModulo: (id) => {
                const modulo = registro.find((candidato) => candidato.id === id);
                if (modulo) irPara(modulo.endereco);
              },
              aoEscolherItem: (_modulo, destino) => irPara(destino),
            }}
          >
            <JanelaComAbas
              abas={abas}
              chaveDaTela={caminho}
              nomeReserva={atual?.nome ?? ''}
              tela={
                interruptor && desligados.includes(interruptor.id) ? (
                  <ModuloDesligado nome={interruptor.nome} />
                ) : (
                  <Outlet />
                )
              }
            />
          </Casca>
          <CursorSuavizado
            {...preferencias.cursor}
            movimentoReduzido={preferencias.acessibilidade.movimento === 'reduzido'}
          />
          <BuscaGlobal
            aberta={buscaAberta}
            aoMudarAberta={mudarBuscaAberta}
            termo={termo}
            aoMudarTermo={definirTermo}
            grupos={busca.grupos}
            aoEscolher={(id) => {
              // Fecha antes de agir: a navegação leva o foco ao destino, fora da busca que sai.
              definirBuscaAberta(false);
              busca.escolher(id);
            }}
          />
          <CentralDeNotificacoes
            aberta={centralAberta}
            aoMudarAberta={definirCentralAberta}
            notificacoes={daCentral.notificacoes.map((notificacao) =>
              paraACentral(notificacao, formatarHora),
            )}
            filtros={daCentral.filtros}
            aoMudarFiltros={daCentral.mudarFiltros}
            naoLidas={daCentral.naoLidas ?? notificacoes.naoLidas}
            temMais={daCentral.temMais}
            carregandoMais={daCentral.carregandoMais}
            aoCarregarMais={daCentral.carregarMais}
            carregando={daCentral.carregando}
            erro={daCentral.erro}
            aoTentarDeNovo={daCentral.tentarDeNovo}
            foco={preferencias.notificacoes.foco}
            aoMudarFoco={(foco) => mudar('notificacoes', { foco })}
            aoAbrir={comNotificacao(notificacoes.abrir)}
            aoMarcarComoLida={comNotificacao(notificacoes.marcarComoLida)}
            aoMarcarTodasComoLidas={notificacoes.marcarTodasComoLidas}
            aoReconhecer={comNotificacao(notificacoes.reconhecer)}
            aoAdiar={comNotificacao(notificacoes.adiar)}
          />
          <RegiaoDeAvisos />
        </ContextoDasAcoesDaTela.Provider>
      </ContextoDaAberturaDaBusca.Provider>
    </ContextoDasAbas.Provider>
  );
}

/** Como está o alerta da notificação, em texto, depois de tratado ou resolvido. */
function situacaoDoAlerta(
  alerta: Notificacao['alerta'],
  formatarHora: (momento: Date) => string,
): string | undefined {
  if (!alerta) return undefined;
  if (alerta.situacao === 'resolvido') return 'Resolvido';
  if (alerta.reconhecido) return `Reconhecido por ${alerta.reconhecido.nome}`;
  if (alerta.adiado) return `Adiado até ${formatarHora(new Date(alerta.adiado.ate))}`;
  return undefined;
}

/** Uma notificação do servidor como a central a mostra, com as ações do alerta que pede ação. */
const paraACentral = (
  notificacao: Notificacao,
  formatarHora: (momento: Date) => string,
): NotificacaoDaCentral => ({
  id: notificacao.id,
  severidade: notificacao.severidade,
  titulo: notificacao.titulo,
  descricao: notificacao.descricao,
  origem: notificacao.origem,
  momento: notificacao.momento,
  lida: notificacao.lida,
  temDestino: notificacao.destino !== undefined,
  podeReconhecer: temAcoesDoAlerta(notificacao),
  podeAdiar: temAcoesDoAlerta(notificacao),
  rotuloDoAdiar: ROTULO_DO_ADIAR,
  situacaoDoAlerta: situacaoDoAlerta(notificacao.alerta, formatarHora),
});

/**
 * Depois de cada navegação que troca o endereço, o foco vai ao título do novo conteúdo, e o leitor
 * de tela anuncia aonde o usuário chegou. Na abertura da página (sem endereço anterior) o foco
 * fica onde está, para o primeiro Tab ir a "Ir para o conteúdo". Com `foco` no endereço, até na
 * abertura, o foco vai ao elemento marcado (design do F1b, decisão 4).
 */
function useFocoNoTituloAoNavegar() {
  const roteador = useRouter();
  useEffect(
    () =>
      roteador.subscribe('onRendered', ({ fromLocation, pathChanged, toLocation }) => {
        const { foco } = toLocation.search as BuscaDaRaiz;
        if (!foco && (!fromLocation || !pathChanged)) return;
        focarDestino(foco);
      }),
    [roteador],
  );
}
