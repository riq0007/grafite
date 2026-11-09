// As notificações gravadas no servidor (spec notificacoes; change p3b-notificacoes-no-servidor,
// design, decisões 5, 7 e 8): a fonte única da casca para o sino e a central. As recentes, a
// primeira página sem filtro com a contagem das não lidas, ficam sempre lidas; a central lê as
// dela, filtradas e em páginas, só aberta. Os eventos das notificações e dos alertas releem as
// duas, e as ações vão às rotas das notificações e às do alerta de que a notificação trata. A
// notificação que chega com a aplicação aberta vira aviso conforme as preferências e o Foco, só na
// aba da vez (decisão 9), e o aviso sai quando ela é lida ou o alerta dela deixa de pedir ação.
import type { components } from '@grafite/api-client';
import { avisar, type FilaDeAvisos, type FiltrosDaCentral, filaDeAvisos } from '@grafite/ui';
import { queryOptions, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ClienteDaApi } from '../api/cliente.ts';
import { consultar } from '../api/consultas.ts';
import { pedir } from '../api/pedir.ts';
import { useApi } from '../api/useApi.tsx';
import { useCanal } from '../eventos/useCanal.tsx';
import { usePreferencias } from '../preferencias/usePreferencias.tsx';
import { useSessao } from '../sessao/useSessao.tsx';
import { type AbaDaVez, vigiarAbaDaVez } from './abaDaVez.ts';

export const CHAVE_DAS_NOTIFICACOES = ['notificacoes'] as const;

/** Quantas notificações o sino lê de uma vez: as recentes, para os avisos e a contagem. */
const RECENTES = 20;
const POR_PAGINA_DA_CENTRAL = 50;

/** O adiar da notificação de um alerta: o mais curto dos adiamentos. */
export const MINUTOS_DO_ADIAR = 15;
export const ROTULO_DO_ADIAR = `Adiar ${MINUTOS_DO_ADIAR} min`;

const SEM_FILTROS: FiltrosDaCentral = { severidade: 'todas', soNaoLidas: false };

/**
 * A consulta das recentes, as do sino: a do provedor e a da etapa "Conectando alertas" da chegada,
 * que a lê antes de a casca aparecer.
 */
export function opcoesDasRecentes(api: ClienteDaApi) {
  return queryOptions({
    queryKey: [...CHAVE_DAS_NOTIFICACOES, 'recentes'],
    queryFn: ({ signal }) =>
      consultar(
        () => api.GET('/notificacoes', { params: { query: { limite: RECENTES } }, signal }),
        'carregar as notificações',
      ),
  });
}

/**
 * A folga do momento da notificação contra o relógio da aba: a gravada pouco antes da abertura, na
 * primeira leitura, já fica vista; a folga só cobre o relógio do servidor um pouco adiantado.
 */
const FOLGA_DO_RELOGIO = 5 * 60_000;

type NotificacaoDaApi = components['schemas']['NotificacaoNaLista'];

export type SeveridadeDaNotificacao = NotificacaoDaApi['severidade'];

export interface Notificacao {
  id: string;
  severidade: SeveridadeDaNotificacao;
  titulo: string;
  descricao?: string;
  /** O módulo que notificou, como "Alertas". */
  origem: string;
  /** Endereço do registro, para "Abrir". */
  destino?: string;
  momento: Date;
  lida: boolean;
  /** O alerta de que ela trata, como está agora. */
  alerta: NotificacaoDaApi['alerta'];
}

const daApi = (notificacao: NotificacaoDaApi): Notificacao => ({
  id: notificacao.id,
  severidade: notificacao.severidade,
  titulo: notificacao.titulo,
  descricao: notificacao.descricao ?? undefined,
  origem: notificacao.origem,
  destino: notificacao.destino ?? undefined,
  momento: new Date(notificacao.criadaEm),
  lida: notificacao.lida,
  alerta: notificacao.alerta,
});

/** O alerta da notificação ainda pede ação: aberto, sem reconhecimento nem adiamento. */
export const pedeAcao = (notificacao: Notificacao) =>
  notificacao.alerta !== null &&
  notificacao.alerta.situacao === 'aberto' &&
  notificacao.alerta.reconhecido === null &&
  notificacao.alerta.adiado === null;

/** Quem vê a notificação pode reconhecer e adiar o alerta dela, Crítico e ainda pedindo ação. */
export const temAcoesDoAlerta = (notificacao: Notificacao) =>
  notificacao.severidade === 'critico' &&
  pedeAcao(notificacao) &&
  notificacao.alerta?.permite.tratar === true;

export interface ControleDasNotificacoes {
  /** As mais recentes, da mais nova para a mais antiga, sem filtro. */
  recentes: readonly Notificacao[];
  naoLidas: number;
  /** Leva ao endereço da notificação e a marca como lida. */
  abrir: (notificacao: Notificacao) => void;
  marcarComoLida: (notificacao: Notificacao) => void;
  marcarTodasComoLidas: () => void;
  /** Reconhece o alerta da notificação e a marca como lida. */
  reconhecer: (notificacao: Notificacao) => void;
  /** Adia o alerta da notificação por 15 minutos e a marca como lida. */
  adiar: (notificacao: Notificacao) => void;
}

const Contexto = createContext<ControleDasNotificacoes | null>(null);

export interface PropsDoProvedorDeNotificacoes {
  /** A fila dos avisos; sem ela, a do aplicativo. */
  fila?: FilaDeAvisos;
  navegar: (destino: string) => void;
  children: ReactNode;
}

export function ProvedorDeNotificacoes({
  fila = filaDeAvisos,
  navegar,
  children,
}: PropsDoProvedorDeNotificacoes) {
  const api = useApi();
  const canal = useCanal();
  const consultas = useQueryClient();
  const ativa = useSessao().tipo === 'ativa';
  const escolhas = usePreferencias().preferencias.notificacoes;

  // O tempo dos avisos temporários segue a preferência, também nos retornos de operação.
  useEffect(() => {
    fila.duracaoDoTemporario = escolhas.tempo * 1000;
  }, [fila, escolhas.tempo]);

  const recentes = useQuery({ ...opcoesDasRecentes(api), enabled: ativa });

  // Uma notificação nova ou lida, e um alerta que muda, releem o sino e a central.
  useEffect(() => {
    const reler = () => void consultas.invalidateQueries({ queryKey: CHAVE_DAS_NOTIFICACOES });
    const pararNotificacoes = canal.ouvir('notificacoes.mudaram', reler);
    const pararAlertas = canal.ouvir('alertas.mudaram', reler);
    return () => {
      pararNotificacoes();
      pararAlertas();
    };
  }, [canal, consultas]);

  const controle = useMemo<ControleDasNotificacoes>(() => {
    const reler = () => consultas.invalidateQueries({ queryKey: CHAVE_DAS_NOTIFICACOES });
    const marcarComoLida = async (notificacao: Notificacao) => {
      if (notificacao.lida) return;
      const resultado = await pedir(
        () => api.POST('/notificacoes/{id}/leitura', { params: { path: { id: notificacao.id } } }),
        'marcar a notificação como lida',
      );
      if ('erro' in resultado) avisar({ situacao: 'atencao', titulo: resultado.erro });
      await reler();
    };
    const doAlerta = (notificacao: Notificacao) => ({
      params: { path: { id: notificacao.alerta?.id ?? '' } },
    });
    return {
      recentes: recentes.data?.itens.map(daApi) ?? [],
      naoLidas: recentes.data?.naoLidas ?? 0,
      abrir: (notificacao) => {
        void marcarComoLida(notificacao);
        if (notificacao.destino) navegar(notificacao.destino);
      },
      marcarComoLida: (notificacao) => void marcarComoLida(notificacao),
      marcarTodasComoLidas: async () => {
        const resultado = await pedir(
          () => api.POST('/notificacoes/leitura'),
          'marcar as notificações como lidas',
        );
        if ('erro' in resultado) avisar({ situacao: 'atencao', titulo: resultado.erro });
        await reler();
      },
      reconhecer: async (notificacao) => {
        if (!notificacao.alerta) return;
        const resultado = await pedir(
          () => api.POST('/alertas/{id}/reconhecimento', doAlerta(notificacao)),
          'reconhecer o alerta',
        );
        if ('erro' in resultado) {
          avisar({ situacao: 'critico', titulo: resultado.erro });
          return;
        }
        avisar({ situacao: 'sucesso', titulo: 'Alerta reconhecido.' });
        await marcarComoLida(notificacao);
      },
      adiar: async (notificacao) => {
        if (!notificacao.alerta) return;
        const resultado = await pedir(
          () =>
            api.POST('/alertas/{id}/adiamento', {
              ...doAlerta(notificacao),
              body: { minutos: MINUTOS_DO_ADIAR },
            }),
          'adiar o alerta',
        );
        if ('erro' in resultado) {
          avisar({ situacao: 'critico', titulo: resultado.erro });
          return;
        }
        avisar({ situacao: 'sucesso', titulo: `Alerta adiado por ${MINUTOS_DO_ADIAR} min.` });
        await marcarComoLida(notificacao);
      },
    };
  }, [api, consultas, navegar, recentes.data]);

  // A aba da vez, vigiada enquanto a aplicação está aberta.
  const abaDaVez = useRef<AbaDaVez | null>(null);
  useEffect(() => {
    abaDaVez.current = vigiarAbaDaVez();
    return () => {
      abaDaVez.current?.parar();
      abaDaVez.current = null;
    };
  }, []);

  const abertaEm = useRef(Date.now());
  const vistas = useRef<Set<string> | null>(null);
  const avisosNaTela = useRef(new Map<string, string>());
  const ultimoControle = useRef(controle);
  ultimoControle.current = controle;
  const ultimasEscolhas = useRef(escolhas);
  ultimasEscolhas.current = escolhas;

  // Cada leitura das recentes: a notificação nova vira aviso, e o aviso que deixou de pedir ação sai.
  useEffect(() => {
    if (!recentes.data) return;
    const itens = recentes.data.itens.map(daApi);
    if (vistas.current === null) {
      // A primeira leitura só marca o que já estava gravado: nenhuma vira aviso.
      vistas.current = new Set(itens.map(({ id }) => id));
      return;
    }
    const { atencao, informacao, foco } = ultimasEscolhas.current;
    for (const notificacao of [...itens].reverse()) {
      if (vistas.current.has(notificacao.id)) continue;
      vistas.current.add(notificacao.id);
      if (notificacao.lida) continue;
      if (notificacao.momento.getTime() < abertaEm.current - FOLGA_DO_RELOGIO) continue;
      if (!(abaDaVez.current?.ehDaVez() ?? true)) continue;
      const critico = notificacao.severidade === 'critico';
      const naTela =
        critico || (!foco && (notificacao.severidade === 'atencao' ? atencao : informacao));
      if (!naTela) continue;
      const acoes = temAcoesDoAlerta(notificacao);
      const chave = avisar(
        {
          situacao: notificacao.severidade,
          titulo: notificacao.titulo,
          descricao: notificacao.descricao,
          aoAbrir: notificacao.destino
            ? () => ultimoControle.current.abrir(notificacao)
            : undefined,
          aoReconhecer: acoes ? () => ultimoControle.current.reconhecer(notificacao) : undefined,
          aoAdiar: acoes ? () => ultimoControle.current.adiar(notificacao) : undefined,
          rotuloDoAdiar: ROTULO_DO_ADIAR,
        },
        fila,
      );
      avisosNaTela.current.set(notificacao.id, chave);
    }
    for (const [id, chave] of avisosNaTela.current) {
      const atual = itens.find((notificacao) => notificacao.id === id);
      if (!atual) {
        avisosNaTela.current.delete(id);
        continue;
      }
      if (atual.lida || (atual.alerta !== null && !pedeAcao(atual))) {
        fila.fechar(chave);
        avisosNaTela.current.delete(id);
      }
    }
  }, [recentes.data, fila]);

  return <Contexto.Provider value={controle}>{children}</Contexto.Provider>;
}

export function useNotificacoes(): ControleDasNotificacoes {
  const controle = useContext(Contexto);
  if (!controle) throw new Error('useNotificacoes precisa do ProvedorDeNotificacoes acima dele.');
  return controle;
}

/**
 * As notificações da central, filtradas pelo servidor e em páginas, lidas só com a central
 * aberta. Os filtros voltam a "Todas" a cada abertura.
 */
export function useNotificacoesDaCentral(aberta: boolean) {
  const api = useApi();
  const ativa = useSessao().tipo === 'ativa';
  const [filtros, definirFiltros] = useState<FiltrosDaCentral>(SEM_FILTROS);
  useEffect(() => {
    if (aberta) definirFiltros(SEM_FILTROS);
  }, [aberta]);
  const consulta = useInfiniteQuery({
    queryKey: [...CHAVE_DAS_NOTIFICACOES, 'central', filtros],
    queryFn: ({ pageParam, signal }) =>
      consultar(
        () =>
          api.GET('/notificacoes', {
            params: {
              query: {
                limite: POR_PAGINA_DA_CENTRAL,
                cursor: pageParam,
                severidade: filtros.severidade === 'todas' ? undefined : filtros.severidade,
                naoLidas: filtros.soNaoLidas ? 'true' : undefined,
              },
            },
            signal,
          }),
        'carregar as notificações',
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima) => ultima.proximo ?? undefined,
    enabled: aberta && ativa,
  });
  const notificacoes = useMemo(
    () => consulta.data?.pages.flatMap((pagina) => pagina.itens.map(daApi)) ?? [],
    [consulta.data],
  );
  return {
    filtros,
    mudarFiltros: definirFiltros,
    notificacoes,
    naoLidas: consulta.data?.pages[0]?.naoLidas,
    temMais: consulta.hasNextPage,
    carregandoMais: consulta.isFetchingNextPage,
    carregarMais: () => void consulta.fetchNextPage(),
    carregando: consulta.isPending && aberta,
    erro: consulta.isError && !consulta.data ? consulta.error.message : null,
    tentarDeNovo: () => void consulta.refetch(),
  };
}
