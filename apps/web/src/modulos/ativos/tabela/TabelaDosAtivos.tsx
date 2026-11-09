// A tabela dos ativos (spec cadastro-de-ativos e tabelas-configuraveis; design do P1c, decisão 10):
// as colunas da visão, a partir do catálogo, com as células de cada tipo; o painel "Colunas", as
// larguras, ocultar e a ordem pelas colunas, tudo pelo estado do endereço; a tabela na altura da
// janela, virtualizada, com a carga ao fim da rolagem, a contagem, a seleção e copiar as linhas; os
// filtros pelas colunas, em "Filtros" e no menu da coluna, com a situação à vista e os filtros ativos;
// a prévia, o resumo da linha e o menu de contexto, com a seleção limpa quando a consulta muda.
import {
  type ColunaDosAtivos,
  colunasDosAtivos,
  type FiltroDaVisao,
  GRUPO_DOS_OUTROS_TIPOS,
  type SituacaoDoFiltro,
} from '@grafite/domain';
import {
  avisar,
  BarraDaTabela,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  CelulaDaMiniatura,
  Checkbox,
  Coluna,
  ColunaDaMiniatura,
  CorpoDaTabela,
  Esqueleto,
  EstadoVazio,
  FaixaDaOrigem,
  FiltrosAtivos,
  type ItemDoResumo,
  Linha,
  MiniaturaDeAtivo,
  PainelDeColunas,
  PainelDeFiltros,
  Popover,
  Selecao,
  Tabela,
  useDataHora,
  usePostura,
  usePrevia,
} from '@grafite/ui';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Columns3, ListFilter, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { itensDasPaginas, paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcoesDaTela } from '../../../busca/acoesDaTela.tsx';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { type ColunaParaCopiar, copiarLinhas } from '../../../tabelas/copiar.ts';
import { useAlturaAteOFim } from '../../../tabelas/useAlturaAteOFim.ts';
import { type EnderecoComLegado, useEstadoDaTabela } from '../../../tabelas/useEstadoDaTabela.ts';
import { useVisoesDaTabela } from '../../../tabelas/VisoesDaTabela.tsx';
import {
  mudancasDaConta,
  useGuardarTabela,
  useVisaoQueAbre,
  useVisoes,
  visoesUsaveis,
} from '../../../tabelas/visoes.ts';
import { CampoComEspera } from '../../administracao/CampoComEspera.tsx';
import estilos from '../Ativos.module.css';
import { imagensDoAtivo } from '../cadastro/imagens.ts';
import { type AtivoNaLista, CHAVE_DOS_ATIVOS, useCampos, useTipos } from '../consultas.ts';
import { COLUNA_DO_CONTROL_ID } from '../control-id.tsx';
import { COLUNA_DA_DISPONIBILIDADE } from '../disponibilidade.tsx';
import type { EnderecoDosAtivos } from '../endereco.ts';
import { buscaDasEtiquetas } from '../etiquetas/endereco.ts';
import { filtroDaOrigem, lerOrigem, origemNoEndereco, useOrigem } from '../origem.ts';
import { COLUNA_DAS_PAGINAS, COLUNA_DOS_SUPRIMENTOS } from '../suprimentos.tsx';
import { ConteudoDaCelula, type ReferenciasDaLista, textoDaCelula } from './celulas.tsx';
import {
  COLUNA_DA_SITUACAO,
  EditorDoFiltroDosAtivos,
  filtravel,
  filtrosAtivos,
  type NomeDoRegistro,
  OPCOES_DA_SITUACAO,
  tiposFiltrados,
  useContagensDaColuna,
} from './filtros.tsx';
import { colunasComLarguras } from './larguras.ts';
import { itensDoMenuDosAtivos } from './menu.ts';
import { PreviaDoAtivo } from './PreviaDoAtivo.tsx';

/** As colunas dos valores coletados, que pedem a releitura da lista a cada minuto. */
const COLUNAS_COLETADAS: ReadonlySet<string> = new Set([
  COLUNA_DA_DISPONIBILIDADE,
  COLUNA_DOS_SUPRIMENTOS,
  COLUNA_DAS_PAGINAS,
  COLUNA_DO_CONTROL_ID,
]);

/** Quantos ativos cada página traz. */
const POR_PAGINA = 100;

const SEM_REFERENCIAS: ReferenciasDaLista = {
  pessoas: {},
  locais: {},
  ativos: {},
  fornecedores: {},
  arquivos: {},
  modelos: {},
  tiposDosModelos: {},
};

const contagem = (total: number) =>
  total === 1 ? '1 ativo' : `${total.toLocaleString('pt-BR')} ativos`;

/**
 * As colunas que a tabela oferece, pelo catálogo: os tipos, os campos e as capacidades, e as
 * consultas de onde vêm, para a tela dizer a falha.
 */
function useColunasDosAtivos() {
  const tipos = useTipos();
  const campos = useCampos();
  const { pode } = useAcesso();
  const verRestritos = pode('ativos.restritos');
  const colunas = useMemo(
    () =>
      tipos.data && campos.data
        ? colunasDosAtivos({
            tipos: tipos.data.tipos,
            campos: campos.data.campos,
            verRestritos,
          })
        : undefined,
    [tipos.data, campos.data, verRestritos],
  );
  /** As colunas na ordem dos painéis, com os grupos dos tipos filtrados primeiro (decisão 4). */
  const nosPaineis = useCallback(
    (tiposDoFiltro: readonly string[]) =>
      tipos.data && campos.data && tiposDoFiltro.length > 0
        ? colunasDosAtivos({
            tipos: tipos.data.tipos,
            campos: campos.data.campos,
            verRestritos,
            tiposFiltrados: tiposDoFiltro,
          })
        : colunas,
    [tipos.data, campos.data, verRestritos, colunas],
  );
  return { colunas, nosPaineis, consultas: [tipos, campos] as const };
}

/** O cabeçalho da coluna, pelo botão de opções dele, para o painel de filtros se prender a ele. */
function cabecalhoDaColuna(rotulo: string): Element | null {
  for (const botao of document.querySelectorAll('[role="columnheader"] [aria-label]')) {
    if (botao.getAttribute('aria-label') === `Opções da coluna ${rotulo}`) {
      return botao.closest('[role="columnheader"]');
    }
  }
  return null;
}

/** O editor do filtro de uma coluna, com quantos ativos cada opção traz pela busca e os filtros. */
function EditorComContagens({
  coluna,
  busca,
  filtros,
  ...resto
}: Omit<Parameters<typeof EditorDoFiltroDosAtivos>[0], 'contagens' | 'tiposDoFiltro'> & {
  busca: string;
  filtros: readonly FiltroDaVisao[];
}) {
  const contagens = useContagensDaColuna(coluna, busca, filtros);
  return (
    <EditorDoFiltroDosAtivos
      {...resto}
      coluna={coluna}
      contagens={contagens}
      tiposDoFiltro={tiposFiltrados(filtros)}
    />
  );
}

/** O endereço sem os parâmetros dos links antigos, que a leitura já trocou pelos filtros. */
function semOLinkAntigo(endereco: EnderecoComLegado): EnderecoComLegado {
  const {
    tipo: _tipo,
    local: _local,
    situacao: _situacao,
    ...resto
  } = endereco as EnderecoComLegado & Record<'tipo' | 'local' | 'situacao', unknown>;
  return resto;
}

/**
 * As referências de todas as páginas: os nomes das pessoas, dos locais, dos ativos, dos
 * fornecedores e dos modelos, e os arquivos.
 */
function juntarReferencias(paginas: readonly { referencias: ReferenciasDaLista }[] = []) {
  const juntas: ReferenciasDaLista = {
    pessoas: {},
    locais: {},
    ativos: {},
    fornecedores: {},
    arquivos: {},
    modelos: {},
    tiposDosModelos: {},
  };
  for (const { referencias } of paginas) {
    Object.assign(juntas.pessoas, referencias.pessoas);
    Object.assign(juntas.locais, referencias.locais);
    Object.assign(juntas.ativos, referencias.ativos);
    // O servidor anterior ao p4a-fornecedores não manda os fornecedores.
    Object.assign(juntas.fornecedores, referencias.fornecedores ?? {});
    Object.assign(juntas.arquivos, referencias.arquivos);
    Object.assign(juntas.modelos, referencias.modelos);
    // O servidor anterior ao filtros-e-barra-da-tabela não manda os tipos dos modelos.
    Object.assign(juntas.tiposDosModelos, referencias.tiposDosModelos ?? {});
  }
  return juntas;
}

export function TabelaDosAtivos() {
  const endereco: EnderecoDosAtivos = useSearch({ from: '/ativos/' });
  const navegar = useNavigate({ from: '/ativos/' });
  const { pode } = useAcesso();
  const api = useApi();
  const dataHora = useDataHora();
  const area = useAlturaAteOFim<HTMLDivElement>();

  const { colunas: disponiveis, nosPaineis, consultas: doCatalogo } = useColunasDosAtivos();
  const postura = usePostura();
  const visoes = useVisoes('ativos');
  // O catálogo ou as visões que não chegaram: a tela diz a falha, com "Tentar de novo".
  const falha = [...doCatalogo, visoes].find((consulta) => consulta.isError && !consulta.data);
  const usaveis = useMemo(
    () => (disponiveis ? visoesUsaveis('ativos', visoes.data?.visoes) : undefined),
    [disponiveis, visoes.data],
  );
  const queAbre = useVisaoQueAbre('ativos', usaveis);
  const daConta = useMemo(() => mudancasDaConta(visoes.data), [visoes.data]);
  const guarda = useGuardarTabela('ativos');
  // O tipo, o local e a situação de um link antigo saem do endereço na primeira troca: viraram os
  // filtros das colunas.
  const mudarEndereco = useCallback(
    (mudar: (atual: EnderecoComLegado) => EnderecoComLegado) =>
      void navegar({ search: (atual) => mudar(semOLinkAntigo(atual)), replace: true }),
    [navegar],
  );
  const estado = useEstadoDaTabela({
    endereco,
    navegar: mudarEndereco,
    usaveis,
    queAbre,
    disponiveis: disponiveis ?? [],
    mudancasDaConta: daConta,
    guardar: guarda.guardar,
  });
  const definicao = estado.definicao;
  const visoesNaTela = useVisoesDaTabela({
    tabela: 'ativos',
    estado,
    visoes: visoes.data?.visoes,
    podeCompartilhar: visoes.data?.permite.compartilhar ?? false,
    descarregar: guarda.descarregar,
  });

  // A origem (decisão 3): o filtro da coluna dela, no lugar do da visão nessa coluna, fora da
  // visão e das mudanças da conta. A que a conta não vê, ou que não existe mais, sai da tabela.
  const { origem: origemNoEnderecoAtual, dentro } = endereco;
  const origem = useMemo(
    () => lerOrigem({ origem: origemNoEnderecoAtual, dentro }),
    [origemNoEnderecoAtual, dentro],
  );
  const daOrigem = useOrigem(origem);
  const filtroDaOrigemAtual =
    origem && daOrigem.estado !== 'indisponivel' ? filtroDaOrigem(origem) : undefined;
  const mudarOrigem = useCallback(
    (nova: { origem?: string; dentro?: true }) =>
      void navegar({
        search: (atual) => ({ ...atual, origem: nova.origem, dentro: nova.dentro }),
        replace: true,
      }),
    [navegar],
  );
  const indisponivel = daOrigem.estado === 'indisponivel';
  useEffect(() => {
    if (!indisponivel) return;
    avisar({ situacao: 'atencao', titulo: 'A origem desta tabela não está disponível.' });
    mudarOrigem({});
  }, [indisponivel, mudarOrigem]);
  const filtrosDaTabela = definicao?.filtros ?? [];
  const filtrosDoPedido = filtroDaOrigemAtual
    ? [
        ...filtrosDaTabela.filter((filtro) => filtro.chave !== filtroDaOrigemAtual.chave),
        filtroDaOrigemAtual,
      ]
    : filtrosDaTabela;

  const parametros = definicao && {
    ...(estado.busca ? { busca: estado.busca } : {}),
    colunas: definicao.colunas.map((coluna) => coluna.chave).join(','),
    ...(definicao.ordenacao
      ? { ordem: definicao.ordenacao.chave, direcao: definicao.ordenacao.direcao }
      : {}),
    filtros: JSON.stringify(filtrosDoPedido),
    fuso: dataHora.fuso,
  };
  // Com uma coluna coletada à vista, como a disponibilidade e os suprimentos, a lista é relida a
  // cada minuto com a aba visível, e a idade das leituras anda na virada do minuto (design do P2a,
  // decisão 5, e do P2b, decisão 10).
  const agora = useAgora();
  const comColeta =
    definicao?.colunas.some((coluna) => COLUNAS_COLETADAS.has(coluna.chave)) ?? false;
  const ativos = useInfiniteQuery({
    queryKey: [...CHAVE_DOS_ATIVOS, 'tabela', parametros],
    enabled: parametros !== undefined,
    refetchInterval: comColeta ? 60_000 : false,
    // Trocar a busca, um filtro, a ordem ou a visão mantém as linhas de antes até as novas chegarem.
    placeholderData: keepPreviousData,
    ...paginar(
      (cursor) =>
        api.GET('/ativos', {
          params: { query: { ...parametros, cursor, limite: POR_PAGINA } },
        }),
      'carregar os ativos',
    ),
  });
  const lista = itensDasPaginas(ativos.data);
  const referencias = useMemo(
    () => (ativos.data ? juntarReferencias(ativos.data.pages) : SEM_REFERENCIAS),
    [ativos.data],
  );
  const [selecao, definirSelecao] = useState<ReadonlySet<string>>(new Set());

  // As colunas à vista, pela visão, com a largura dela ou a padrão da coluna.
  const porChave = useMemo(
    () => new Map((disponiveis ?? []).map((coluna) => [coluna.chave, coluna])),
    [disponiveis],
  );
  const aVista = useMemo(
    () =>
      (definicao?.colunas ?? []).flatMap((daVisao) => {
        const coluna = porChave.get(daVisao.chave);
        return coluna ? [{ ...coluna, largura: daVisao.largura ?? coluna.largura }] : [];
      }),
    [definicao, porChave],
  );
  // Na tabela, só vale a largura que a visão guardou: a coluna sem ela divide a sobra (change
  // redesenho-da-interface, design, decisão 2).
  const larguraDaVisao = useMemo(
    () => new Map((definicao?.colunas ?? []).map((daVisao) => [daVisao.chave, daVisao.largura])),
    [definicao],
  );
  const padroes = useMemo(
    () => new Map((disponiveis ?? []).map((coluna) => [coluna.chave, coluna.largura])),
    [disponiveis],
  );

  // Os filtros: a situação à vista, o editor da coluna escolhida, preso ao botão "Filtros", e os
  // nomes dos tipos, dos modelos, das pessoas e dos locais que eles citam.
  const tiposDoCatalogo = doCatalogo[0].data?.tipos;
  const opcoesDosTipos = useMemo(
    () =>
      (tiposDoCatalogo ?? [])
        .filter((tipo) => tipo.situacao === 'ativo')
        .map((tipo) => ({ id: tipo.id, rotulo: tipo.nome })),
    [tiposDoCatalogo],
  );
  const nomeDoRegistro: NomeDoRegistro = useCallback(
    (id: string) =>
      tiposDoCatalogo?.find((tipo) => tipo.id === id)?.nome ??
      referencias.modelos[id] ??
      referencias.pessoas[id] ??
      referencias.locais[id] ??
      referencias.ativos[id] ??
      referencias.fornecedores[id],
    [tiposDoCatalogo, referencias],
  );
  const filtros = definicao?.filtros ?? [];
  const filtroDa = (chave: string) => filtros.find((filtro) => filtro.chave === chave);
  const mudarFiltro = (chave: string, filtro: FiltroDaVisao | null) =>
    estado.mudar({
      filtros: [...filtros.filter((outro) => outro.chave !== chave), ...(filtro ? [filtro] : [])],
    });
  const daSituacao = filtroDa(COLUNA_DA_SITUACAO);
  const situacao = daSituacao?.operador === 'situacao' ? daSituacao.situacao : 'ativos';
  const comFiltros =
    estado.busca !== '' ||
    situacao !== 'ativos' ||
    filtros.some((filtro) => filtro.chave !== COLUNA_DA_SITUACAO);
  const limparFiltros = () =>
    estado.mudar(
      { filtros: [{ chave: COLUNA_DA_SITUACAO, operador: 'situacao', situacao: 'ativos' }] },
      { busca: '' },
    );
  // O painel de filtros (decisão 1): preso ao botão "Filtros" ou, pelo "Filtrar…" de uma coluna, ao
  // cabeçalho dela, já nela; a coluna escolhida troca o editor sem fechar o painel.
  const botaoDosFiltros = useRef<HTMLButtonElement>(null);
  const ancoraDosFiltros = useRef<Element | null>(null);
  const [filtrando, definirFiltrando] = useState<{ coluna: string | null } | null>(null);
  const abrirOsFiltros = (coluna: ColunaDosAtivos | null) => {
    ancoraDosFiltros.current =
      (coluna ? cabecalhoDaColuna(coluna.rotulo) : null) ?? botaoDosFiltros.current;
    definirFiltrando({ coluna: coluna?.chave ?? null });
  };
  const colunaFiltrada =
    filtrando?.coluna === null || filtrando === null ? undefined : porChave.get(filtrando.coluna);
  // Com um filtro de Tipo, os painéis mostram primeiro os grupos daqueles tipos (decisão 4).
  const chaveDosTiposFiltrados = tiposFiltrados(filtrosDoPedido).join(',');
  const colunasNosPaineis = useMemo(
    () => nosPaineis(chaveDosTiposFiltrados ? chaveDosTiposFiltrados.split(',') : []),
    [nosPaineis, chaveDosTiposFiltrados],
  );
  const recolhidos = [GRUPO_DOS_OUTROS_TIPOS];
  /** O editor de uma coluna, com as contagens, que aplica ou tira o filtro e fecha. */
  const editorDaColuna = (coluna: ColunaDosAtivos, fechar: () => void) => (
    <EditorComContagens
      key={coluna.chave}
      coluna={coluna}
      busca={estado.busca}
      filtros={filtrosDoPedido}
      filtro={filtroDa(coluna.chave)}
      tipos={opcoesDosTipos}
      nomeDoRegistro={nomeDoRegistro}
      aoAplicar={(filtro) => {
        mudarFiltro(coluna.chave, filtro);
        fechar();
      }}
      aoTirar={() => {
        mudarFiltro(coluna.chave, null);
        fechar();
      }}
    />
  );

  const abrirFicha = (id: string) => void navegar({ to: '/ativos/$id', params: { id } });
  // Com a origem, o cadastro vem com o campo dela preenchido.
  const novoAtivo = () =>
    void navegar({
      to: '/ativos/novo',
      search: origem ? { origem: origemNoEndereco(origem) } : {},
    });
  /** A tela das etiquetas com as linhas, na ordem da tabela (spec etiquetas-de-ativos). */
  const imprimirEtiquetas = (chaves: readonly string[]) =>
    void navegar({
      to: '/ativos/etiquetas',
      search: buscaDasEtiquetas(
        lista.filter((ativo) => chaves.includes(ativo.id)).map((ativo) => ativo.id),
      ),
    });
  const podeCadastrar = pode('ativos.editar');
  // As ações da tabela na busca, em "Nesta tela" (change relacoes-vivas, decisão 5).
  useAcoesDaTela([
    ...(podeCadastrar
      ? [
          {
            id: 'novo-ativo',
            rotulo: 'Novo ativo',
            palavrasChave: ['cadastrar'],
            executar: novoAtivo,
          },
        ]
      : []),
    {
      id: 'filtrar-por-tipo',
      rotulo: 'Filtrar por tipo…',
      palavrasChave: ['filtros'],
      executar: () => abrirOsFiltros(porChave.get('ativo.tipo') ?? null),
    },
  ]);

  const paraCopiar: ColunaParaCopiar<AtivoNaLista>[] = aVista.map((coluna) => ({
    rotulo: coluna.rotulo,
    texto: (ativo) => textoDaCelula(coluna, ativo, referencias, dataHora),
  }));
  const copiarAsLinhas = (chaves: readonly string[]) =>
    void copiarLinhas(
      paraCopiar,
      lista.filter((ativo) => chaves.includes(ativo.id)),
    );

  // A busca, um filtro, a ordem ou a visão que mudam limpam a seleção: ela era de outra consulta.
  const daConsulta = JSON.stringify([
    estado.visao,
    estado.busca,
    origemNoEnderecoAtual,
    dentro,
    definicao?.filtros,
    definicao?.ordenacao,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a seleção recomeça a cada consulta nova.
  useEffect(() => definirSelecao(new Set()), [daConsulta]);

  // A prévia passa pela lista toda, pelo total, ou só pelos selecionados.
  const carregarMais = {
    haMais: ativos.hasNextPage,
    carregando: ativos.isFetchingNextPage,
    aoCarregar: () => void ativos.fetchNextPage(),
  };
  const previa = usePrevia(lista, (ativo) => ativo.id, {
    total: ativos.data?.pages[0]?.total,
    carregarMais,
    selecao,
  });
  const porId = useMemo(() => new Map(lista.map((ativo) => [ativo.id, ativo])), [lista]);
  // O resumo: as colunas à vista, com o valor como a célula o mostra.
  const resumoDaLinha = (chave: string): ItemDoResumo[] => {
    const ativo = porId.get(chave);
    if (!ativo) return [];
    return aVista.map((coluna) => ({
      coluna: coluna.chave,
      rotulo: coluna.rotulo,
      valor: (
        <ConteudoDaCelula
          coluna={coluna}
          ativo={ativo}
          texto={textoDaCelula(coluna, ativo, referencias, dataHora)}
        />
      ),
    }));
  };

  // A primeira carga desenha o esqueleto; a troca da consulta mantém as linhas de antes, ocupadas,
  // e a contagem diz "Atualizando…" (change filtros-e-barra-da-tabela, design, decisão 6).
  const primeiraCarga = !falha && (!definicao || ativos.isPending);
  const atualizando = ativos.isPlaceholderData && ativos.isFetching;
  // O filtro da visão na coluna da origem não vale enquanto ela estiver: ele não aparece.
  const filtrosEmTexto = filtrosAtivos(
    filtros.filter((filtro) => filtro.chave !== filtroDaOrigemAtual?.chave),
    porChave,
    nomeDoRegistro,
    referencias.tiposDosModelos,
  );
  // As ações em lote são as do menu de contexto para a seleção, na mesma ordem (decisão 5).
  const selecionadas = lista.filter((ativo) => selecao.has(ativo.id)).map((ativo) => ativo.id);
  const acoesEmLote =
    selecionadas.length === 0
      ? []
      : itensDoMenuDosAtivos({
          chaves: selecionadas,
          ativos: porId,
          abrir: abrirFicha,
          prever: previa.aoPreverLinha,
          copiarLinhas: copiarAsLinhas,
          imprimirEtiquetas,
        }).map(({ id, rotulo, aoEscolher }) => ({ id, rotulo, aoEscolher }));
  return (
    <div className={estilos.telaDaTabela}>
      <CabecalhoDaPagina
        titulo="Ativos"
        acoes={
          podeCadastrar && (
            <Botao nivel="primario" icone={Plus} onPress={novoAtivo}>
              Novo ativo
            </Botao>
          )
        }
      />
      <BarraDaTabela
        contagem={
          primeiraCarga || (ativos.isError && !ativos.data)
            ? null
            : atualizando
              ? 'Atualizando…'
              : contagem(ativos.data?.pages[0]?.total ?? 0)
        }
        origem={
          origem && !indisponivel ? (
            <FaixaDaOrigem
              descricao={
                daOrigem.estado === 'pronta' ? daOrigem.resumo.descricao : 'Carregando a origem…'
              }
              opcao={
                origem.tipo === 'local' ? (
                  <Checkbox
                    isSelected={origem.comOsDeDentro}
                    onChange={(incluir) =>
                      mudarOrigem({
                        origem: origemNoEndereco(origem),
                        ...(incluir ? { dentro: true as const } : {}),
                      })
                    }
                  >
                    Incluir os locais de dentro
                  </Checkbox>
                ) : undefined
              }
              aoLimpar={() => mudarOrigem({})}
            />
          ) : null
        }
        linhaDaVisao={definicao ? visoesNaTela.linha : null}
        filtros={
          filtrosEmTexto.length > 0 ? (
            <FiltrosAtivos
              filtros={filtrosEmTexto}
              aoLimpar={(chave) => mudarFiltro(chave, null)}
              aoLimparTodos={limparFiltros}
              editor={(chave, fechar) => {
                const coluna = porChave.get(chave);
                return coluna ? editorDaColuna(coluna, fechar) : null;
              }}
            />
          ) : null
        }
        selecao={{
          quantas: selecao.size,
          acoes: acoesEmLote,
          aoLimpar: () => definirSelecao(new Set()),
        }}
      >
        {definicao && visoesNaTela.escolha}
        <CampoComEspera
          type="search"
          rotulo="Buscar ativos"
          placeholder="Nome, patrimônio, série, hostname ou modelo"
          valor={estado.busca}
          aoMudar={estado.mudarBusca}
        />
        <Selecao
          rotulo="Situação"
          opcoes={OPCOES_DA_SITUACAO}
          selectedKey={situacao}
          isDisabled={!definicao}
          onSelectionChange={(chave) =>
            mudarFiltro(COLUNA_DA_SITUACAO, {
              chave: COLUNA_DA_SITUACAO,
              operador: 'situacao',
              situacao: String(chave) as SituacaoDoFiltro,
            })
          }
        />
        {disponiveis && definicao && (
          <Botao ref={botaoDosFiltros} icone={ListFilter} onPress={() => abrirOsFiltros(null)}>
            Filtros
          </Botao>
        )}
        {filtrando && colunasNosPaineis && (
          <Popover
            titulo="Filtros"
            ocultarTitulo
            ancora={ancoraDosFiltros}
            aberto
            aoMudarAberto={(aberto) => {
              if (!aberto) definirFiltrando(null);
            }}
          >
            <PainelDeFiltros
              colunas={colunasNosPaineis
                .filter((coluna) => filtravel(coluna) && coluna.chave !== COLUNA_DA_SITUACAO)
                .map((coluna) => ({
                  chave: coluna.chave,
                  rotulo: coluna.rotulo,
                  grupo: coluna.grupo,
                  filtrada: filtros.some((filtro) => filtro.chave === coluna.chave),
                }))}
              escolhida={filtrando.coluna}
              aoEscolher={(chave) => definirFiltrando({ coluna: chave })}
              recolhidos={recolhidos}
              estreito={postura === 'celular'}
              editor={
                colunaFiltrada && editorDaColuna(colunaFiltrada, () => definirFiltrando(null))
              }
            />
          </Popover>
        )}
        {disponiveis && definicao && (
          <Popover
            titulo="Colunas"
            ocultarTitulo
            posicao="bottom end"
            gatilho={<Botao icone={Columns3}>Colunas</Botao>}
          >
            <PainelDeColunas
              colunas={colunasNosPaineis ?? disponiveis}
              recolhidos={recolhidos}
              aVista={definicao.colunas.map((coluna) => coluna.chave)}
              aoMudar={(chaves) =>
                estado.mudar({
                  colunas: chaves.map(
                    (chave) =>
                      definicao.colunas.find((coluna) => coluna.chave === chave) ?? { chave },
                  ),
                })
              }
            />
          </Popover>
        )}
      </BarraDaTabela>
      <div ref={area} className={estilos.areaDaTabela}>
        {falha ? (
          <EstadoVazio
            titulo={falha.error?.message ?? 'Não foi possível carregar os ativos.'}
            acao={<Botao onPress={() => void falha.refetch()}>Tentar de novo</Botao>}
          />
        ) : !definicao ? (
          // As colunas ainda não chegaram: o esqueleto das linhas, sem elas.
          <div aria-busy="true" className={estilos.esqueletoDaTabela}>
            <span className={estilos.somenteLeitor}>Carregando os ativos.</span>
            {[72, 48, 64, 40, 56, 68].map((largura) => (
              <Esqueleto key={largura} largura={`${largura}%`} />
            ))}
          </div>
        ) : ativos.isError && !ativos.data ? (
          <EstadoVazio
            titulo={ativos.error.message}
            acao={<Botao onPress={() => void ativos.refetch()}>Tentar de novo</Botao>}
          />
        ) : !primeiraCarga && lista.length === 0 ? (
          // Fora da tabela: na tabela larga, o estado vazio ficaria no meio da rolagem de lado.
          <EstadoVazio
            titulo="Nenhum ativo encontrado."
            acao={
              comFiltros ? (
                <Botao onPress={limparFiltros}>Limpar filtros</Botao>
              ) : podeCadastrar ? (
                <Botao icone={Plus} onPress={novoAtivo}>
                  Novo ativo
                </Botao>
              ) : undefined
            }
          />
        ) : (
          <Tabela
            rotulo="Ativos"
            carregando={primeiraCarga || atualizando}
            virtualizada
            redimensionavel
            ordenacao={
              definicao.ordenacao
                ? { coluna: definicao.ordenacao.chave, direcao: definicao.ordenacao.direcao }
                : undefined
            }
            aoOrdenar={({ coluna, direcao }) =>
              estado.mudar({ ordenacao: { chave: coluna, direcao } })
            }
            aoRedimensionar={(larguras) =>
              estado.mudar({ colunas: colunasComLarguras(definicao.colunas, larguras, padroes) })
            }
            aoAbrirLinha={abrirFicha}
            aoPreverLinha={previa.aoPreverLinha}
            carregarMais={carregarMais}
            selecao={selecao}
            aoMudarSelecao={definirSelecao}
            aoCopiar={copiarAsLinhas}
            menuDeContexto={(chaves) =>
              itensDoMenuDosAtivos({
                chaves,
                ativos: porId,
                abrir: abrirFicha,
                prever: previa.aoPreverLinha,
                copiarLinhas: copiarAsLinhas,
                imprimirEtiquetas,
              })
            }
            resumoDaLinha={resumoDaLinha}
          >
            <CabecalhoDaTabela>
              <ColunaDaMiniatura>Imagem</ColunaDaMiniatura>
              {aVista.map((coluna) => (
                <Coluna
                  key={coluna.chave}
                  id={coluna.chave}
                  principal={coluna.principal}
                  ordenavel={coluna.ordena}
                  largura={larguraDaVisao.get(coluna.chave)}
                  alinhamento={coluna.alinhamento}
                  menu={{
                    aoFiltrar: filtravel(coluna) ? () => abrirOsFiltros(coluna) : undefined,
                    aoOcultar: () =>
                      estado.mudar({
                        colunas: definicao.colunas.filter(
                          (daVisao) => daVisao.chave !== coluna.chave,
                        ),
                      }),
                  }}
                >
                  {coluna.rotulo}
                </Coluna>
              ))}
            </CabecalhoDaTabela>
            <CorpoDaTabela itens={lista} dependencias={[aVista, referencias, dataHora, agora]}>
              {(ativo) => (
                <Linha id={ativo.id}>
                  <CelulaDaMiniatura>
                    <MiniaturaDeAtivo tipo={ativo.tipo.icone} {...imagensDoAtivo(ativo, 64)} />
                  </CelulaDaMiniatura>
                  {aVista.map((coluna) => (
                    <Celula key={coluna.chave} alinhamento={coluna.alinhamento} mono={coluna.mono}>
                      <ConteudoDaCelula
                        coluna={coluna}
                        ativo={ativo}
                        texto={textoDaCelula(coluna, ativo, referencias, dataHora)}
                        agora={agora}
                      />
                    </Celula>
                  ))}
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        )}
      </div>
      <PreviaDoAtivo
        previa={previa}
        colunas={porChave}
        aVista={aVista}
        referencias={referencias}
        dataHora={dataHora}
        aoAbrir={abrirFicha}
      />
      {visoesNaTela.dialogos}
    </div>
  );
}
