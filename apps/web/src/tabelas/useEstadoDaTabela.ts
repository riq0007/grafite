// O estado de uma tabela com visões (design do P1c, decisão 8; design do visoes-da-conta, decisão
// 3): a visão aberta com três camadas, o endereço, as mudanças da conta e a visão salva. Com o
// `guardar`, a mudança do usuário é guardada sozinha, na conta ou na própria visão, e o endereço fica
// só com o que veio de um link; sem ele, a mudança fica no endereço e marca a tabela, como antes. O
// endereço sem visão, ou com uma que a conta não pode usar, é reescrito com a visão que abre; as
// mudanças iguais à tabela da conta saem dele.
import {
  aplicarAColunas,
  type ColunaDaTabela,
  type DefinicaoDaVisao,
  type EstadoDaVisao,
  type FiltroDaVisao,
  mesmaDefinicao,
} from '@grafite/domain';
import { avisar } from '@grafite/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  comAsIndisponiveis,
  definicaoComMudancas,
  type EnderecoDaTabela,
  type MudancasNoEndereco,
  mudancasSobre,
} from './endereco.ts';
import type { VisaoUsavel } from './visoes.ts';

/** O endereço com os filtros de um link antigo, que valem sobre os da visão até a reescrita. */
export interface EnderecoComLegado extends EnderecoDaTabela {
  legado?: FiltroDaVisao[];
}

/** O que a tabela guarda sozinha, depois de uma mudança do usuário. */
export type GravacaoDaTabela =
  /** As mudanças da conta sobre a visão de fábrica ou uma da organização. */
  | { tipo: 'mudancas'; visao: string; definicao: DefinicaoDaVisao }
  /** A própria visão da conta, que guarda a mudança nela. */
  | { tipo: 'visao'; id: string; definicao: DefinicaoDaVisao }
  /** A visão sem as mudanças da conta. */
  | { tipo: 'restaurar'; visao: string };

export interface PropsDoEstadoDaTabela {
  endereco: EnderecoComLegado;
  /** Troca o endereço sem uma entrada nova no histórico. */
  navegar: (mudar: (atual: EnderecoComLegado) => EnderecoComLegado) => void;
  /** As visões que a conta pode usar, com a de fábrica, pelo id; ausente enquanto carregam. */
  usaveis: ReadonlyMap<string, VisaoUsavel> | undefined;
  /** A visão que abre a tabela sem uma no endereço. */
  queAbre: string;
  /** As colunas que a tabela oferece agora. */
  disponiveis: readonly ColunaDaTabela[];
  /** As mudanças da conta guardadas no servidor, pela visão, com a de fábrica como `fabrica`. */
  mudancasDaConta?: ReadonlyMap<string, DefinicaoDaVisao>;
  /** Guarda a mudança do usuário; sem ele, a mudança fica no endereço. */
  guardar?: (gravacao: GravacaoDaTabela) => Promise<void>;
}

export interface EstadoDaTabela {
  /** A visão aberta. */
  visao: string;
  /** A tabela como aparece, sem o que deixou de valer; ausente enquanto as visões carregam. */
  definicao: DefinicaoDaVisao | undefined;
  /** A definição salva da visão aberta. */
  salva: DefinicaoDaVisao | undefined;
  /**
   * A tabela para salvar: a tabela como aparece, sem tirar as colunas, os filtros e a ordem que
   * deixaram de valer, para voltarem com o campo.
   */
  paraSalvar: DefinicaoDaVisao | undefined;
  /** A visão salva, personalizada pela conta ou vinda de um link. */
  estado: EstadoDaVisao;
  /** A tabela difere da visão salva: personalizada ou do link. */
  alterada: boolean;
  busca: string;
  /** Muda a tabela e, com `busca`, também a busca, na mesma troca do endereço. */
  mudar: (mudanca: Partial<DefinicaoDaVisao>, opcoes?: { busca?: string }) => void;
  mudarBusca: (busca: string) => void;
  /** Tira do endereço o que veio do link, sem tirar a busca: volta à tabela da conta. */
  descartar: () => void;
  /** Apaga as mudanças da conta e mostra a visão como está salva. */
  restaurar: () => void;
  /** Abre outra visão, sem as mudanças da anterior no endereço; sem o id, a que abre a tabela. */
  escolher: (id?: string) => void;
}

const SEM_MUDANCAS = { colunas: undefined, ordem: undefined, filtros: undefined } as const;

/** Os filtros do link antigo no lugar dos da mesma coluna. */
const comOLegado = (filtros: FiltroDaVisao[], legado: FiltroDaVisao[]) => [
  ...filtros.filter((filtro) => !legado.some((antigo) => antigo.chave === filtro.chave)),
  ...legado,
];

const mesmasMudancas = (a: MudancasNoEndereco, b: MudancasNoEndereco) =>
  a.colunas === b.colunas &&
  a.ordem === b.ordem &&
  (a.filtros === undefined) === (b.filtros === undefined) &&
  mesmaDefinicao(
    { colunas: [], ordenacao: null, filtros: a.filtros ?? [] },
    { colunas: [], ordenacao: null, filtros: b.filtros ?? [] },
  );

const semMudancas = (mudancas: MudancasNoEndereco) =>
  mudancas.colunas === undefined && mudancas.ordem === undefined && mudancas.filtros === undefined;

export function useEstadoDaTabela({
  endereco,
  navegar,
  usaveis,
  queAbre,
  disponiveis,
  mudancasDaConta,
  guardar,
}: PropsDoEstadoDaTabela): EstadoDaTabela {
  const usavel = endereco.visao !== undefined && usaveis?.has(endereco.visao) === true;
  const visao = usavel && endereco.visao !== undefined ? endereco.visao : queAbre;
  const daConta = usaveis?.get(visao)?.daConta === true;
  // A decisão desta sessão que o servidor ainda não confirmou, por visão: a tabela nova, ou `null`,
  // a visão restaurada.
  const [pendentes, definirPendentes] = useState<ReadonlyMap<string, DefinicaoDaVisao | null>>(
    () => new Map(),
  );
  const pendente = pendentes.get(visao);
  const salvaNoServidor = usaveis?.get(visao)?.definicao;
  // Na visão da conta, a mudança pendente é a própria visão salva.
  const salva = daConta && pendente ? pendente : salvaNoServidor;
  const mudancasGuardadas = daConta
    ? undefined
    : pendente === undefined
      ? mudancasDaConta?.get(visao)
      : (pendente ?? undefined);
  // A tabela da conta, sem o endereço: as mudanças dela, quando diferem da visão, ou a visão.
  const base =
    salva && mudancasGuardadas && !mesmaDefinicao(mudancasGuardadas, salva)
      ? mudancasGuardadas
      : salva;
  const chaves = useMemo(() => new Set(disponiveis.map((coluna) => coluna.chave)), [disponiveis]);

  // As mudanças como valem: as do endereço com as do link antigo, só onde diferem da tabela da conta.
  const mudancas = useMemo(() => {
    if (!base) return undefined;
    const doEndereco = endereco.legado
      ? { ...endereco, filtros: comOLegado(endereco.filtros ?? base.filtros, endereco.legado) }
      : endereco;
    return mudancasSobre(base, definicaoComMudancas(base, doEndereco));
  }, [endereco, base]);

  // O endereço que não diz a visão aberta, ou que traz mudanças iguais a ela ou um link antigo, é
  // reescrito. A visão que a conta não pode usar avisa uma vez: a que estava aberta foi removida.
  const avisada = useRef<string | null>(null);
  const aberta = useRef<{ id: string; nome: string } | null>(null);
  useEffect(() => {
    if (!usaveis || !mudancas) return;
    const doEndereco = endereco.visao === undefined ? undefined : usaveis.get(endereco.visao);
    if (endereco.visao !== undefined && doEndereco) {
      aberta.current = { id: endereco.visao, nome: doEndereco.nome };
    }
    if (endereco.visao !== undefined && !usavel && avisada.current !== endereco.visao) {
      avisada.current = endereco.visao;
      const removida = aberta.current?.id === endereco.visao ? aberta.current.nome : null;
      avisar({
        situacao: 'atencao',
        titulo: removida
          ? `A visão ${removida} foi removida.`
          : 'A visão do endereço não está disponível.',
      });
    }
    if (endereco.visao === visao && !endereco.legado && mesmasMudancas(endereco, mudancas)) return;
    navegar((atual) => ({ ...atual, legado: undefined, visao, ...SEM_MUDANCAS, ...mudancas }));
  }, [endereco, mudancas, navegar, usaveis, usavel, visao]);

  // A visão da organização salva em outra sessão avisa uma vez, quando a conta tem mudanças
  // guardadas sobre ela: a tabela continua com as mudanças, que escondem a visão nova.
  const vista = useRef<{ id: string; definicao: DefinicaoDaVisao } | null>(null);
  const comMudancasNoServidor = mudancasDaConta?.has(visao) === true;
  const nomeDaVisao = usaveis?.get(visao)?.nome;
  useEffect(() => {
    if (!salvaNoServidor) return;
    const anterior = vista.current;
    vista.current = { id: visao, definicao: salvaNoServidor };
    if (!anterior || anterior.id !== visao || daConta || !comMudancasNoServidor) return;
    if (mesmaDefinicao(anterior.definicao, salvaNoServidor)) return;
    avisar({
      situacao: 'info',
      titulo: `A visão ${nomeDaVisao} foi atualizada pela organização. Suas mudanças continuam sobre ela.`,
    });
  }, [visao, salvaNoServidor, daConta, comMudancasNoServidor, nomeDaVisao]);

  // A decisão pendente sai quando o servidor passa a dizer o mesmo: nas mudanças da conta, na visão
  // da conta, ou na visão da organização em que a tabela foi publicada.
  useEffect(() => {
    if (pendentes.size === 0) return;
    const confirmadas = [...pendentes].filter(([id, tabela]) => {
      const naLista = usaveis?.get(id);
      const daContaNoServidor = naLista?.daConta === true;
      const noServidor = daContaNoServidor ? naLista?.definicao : mudancasDaConta?.get(id);
      if (tabela === null) return noServidor === undefined || daContaNoServidor;
      if (noServidor !== undefined) return mesmaDefinicao(noServidor, tabela);
      return naLista !== undefined && mesmaDefinicao(naLista.definicao, tabela);
    });
    if (confirmadas.length === 0) return;
    definirPendentes((atuais) => {
      const novas = new Map(atuais);
      for (const [id, tabela] of confirmadas) if (novas.get(id) === tabela) novas.delete(id);
      return novas;
    });
  }, [pendentes, usaveis, mudancasDaConta]);

  const tabela = base && mudancas ? definicaoComMudancas(base, mudancas) : undefined;
  const definicao = useMemo(
    () => (tabela ? aplicarAColunas(tabela, disponiveis) : undefined),
    [tabela, disponiveis],
  );
  const doLink = mudancas !== undefined && !semMudancas(mudancas);
  const estado: EstadoDaVisao = doLink ? 'do-link' : base !== salva ? 'personalizada' : 'salva';

  function decidir(id: string, decisao: DefinicaoDaVisao | null) {
    definirPendentes((atuais) => new Map(atuais).set(id, decisao));
  }

  /** A tabela nova, guardada na conta ou na visão dela, e o endereço sem mudanças. */
  function guardarTabela(
    gravar: NonNullable<typeof guardar>,
    nova: DefinicaoDaVisao,
    busca?: string,
  ) {
    if (!salvaNoServidor) return;
    if (daConta) {
      decidir(visao, nova);
      void gravar({ tipo: 'visao', id: visao, definicao: nova });
    } else if (mesmaDefinicao(nova, salvaNoServidor)) {
      decidir(visao, null);
      void gravar({ tipo: 'restaurar', visao });
    } else {
      decidir(visao, nova);
      void gravar({ tipo: 'mudancas', visao, definicao: nova });
    }
    navegar((atual) => ({
      ...atual,
      ...(busca === undefined ? {} : { busca: busca.trim() === '' ? undefined : busca }),
      legado: undefined,
      visao,
      ...SEM_MUDANCAS,
    }));
  }

  return {
    visao,
    definicao,
    salva,
    paraSalvar: tabela,
    estado,
    alterada: estado !== 'salva',
    busca: endereco.busca ?? '',
    mudar: (mudanca, opcoes) => {
      if (!base || !definicao) return;
      const nova = comAsIndisponiveis({ ...definicao, ...mudanca }, base, chaves);
      if (guardar) {
        guardarTabela(guardar, nova, opcoes?.busca);
        return;
      }
      const novas = mudancasSobre(base, nova);
      const busca = opcoes?.busca;
      navegar((atual) => ({
        ...atual,
        ...(busca === undefined ? {} : { busca: busca.trim() === '' ? undefined : busca }),
        legado: undefined,
        visao,
        ...SEM_MUDANCAS,
        ...novas,
      }));
    },
    mudarBusca: (busca) =>
      navegar((atual) => ({ ...atual, busca: busca.trim() === '' ? undefined : busca })),
    descartar: () => navegar((atual) => ({ ...atual, legado: undefined, ...SEM_MUDANCAS })),
    restaurar: () => {
      if (guardar && !daConta) {
        decidir(visao, null);
        void guardar({ tipo: 'restaurar', visao });
      }
      navegar((atual) => ({ ...atual, legado: undefined, ...SEM_MUDANCAS }));
    },
    escolher: (id) =>
      navegar((atual) => ({ ...atual, legado: undefined, visao: id, ...SEM_MUDANCAS })),
  };
}
