// Os filtros da tabela dos ativos (spec tabelas-configuraveis e cadastro-de-ativos; design do P1c,
// decisão 10; change filtros-e-barra-da-tabela, decisões 2 a 4): o editor de cada coluna com as
// escolhas dela (os tipos e as situações pelo catálogo, as opções do campo, o local pela árvore, as
// pessoas e os modelos pela busca na API), com quantos ativos cada opção traz, os modelos dos tipos
// filtrados primeiro, e os filtros ativos em texto, com o operador e o modelo de outro tipo marcado.
import {
  type ColunaDosAtivos,
  type FiltroDaVisao,
  operadoresDa,
  partesDoFiltro,
  ROTULOS_DAS_SITUACOES,
  SITUACOES_DO_FILTRO,
} from '@grafite/domain';
import {
  BotaoDeIcone,
  EditorDeFiltro,
  type FiltroAtivo,
  type FiltroDoEditor,
  type OpcaoDoFiltro,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useBuscarFornecedores } from '../../administracao/fornecedores/escolha.ts';
import {
  type ResultadoDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import { SeletorDeLocal } from '../../administracao/seletores/SeletorDeLocal.tsx';
import estilos from '../Ativos.module.css';
import { CHAVE_DOS_ATIVOS } from '../consultas.ts';
import { COLUNA_DO_CONTROL_ID } from '../control-id.tsx';
import { COLUNA_DA_DISPONIBILIDADE } from '../disponibilidade.tsx';

/** A coluna da situação: o filtro dela fica à vista na barra, e não na linha dos filtros ativos. */
export const COLUNA_DA_SITUACAO = 'ativo.situacao';

/** Se a coluna se filtra: pelo filtro dela, ou só por "Está vazio" e "Está preenchido". */
export const filtravel = (coluna: ColunaDosAtivos) =>
  coluna.filtro !== null || coluna.podeFicarVazia;

export const OPCOES_DA_SITUACAO: OpcaoDoFiltro[] = SITUACOES_DO_FILTRO.map((situacao) => ({
  id: situacao,
  rotulo: ROTULOS_DAS_SITUACOES[situacao],
}));

/** O nome de um registro de um filtro: o tipo, o modelo, a pessoa ou o caminho do local. */
export type NomeDoRegistro = (id: string) => string | undefined;

/** Os tipos do filtro de Tipo, pelos ids, como o encadeamento do Modelo e dos painéis os usa. */
export function tiposFiltrados(filtros: readonly FiltroDaVisao[]): string[] {
  const doTipo = filtros.find((filtro) => filtro.chave === 'ativo.tipo');
  return doTipo?.operador === 'qualquer' ? [...doTipo.valores] : [];
}

/**
 * As colunas que contam as opções: o tipo, o modelo, as listas, a disponibilidade e o Control iD.
 * As pessoas, com centenas de opções, vão pela busca, sem contagem.
 */
export function contaAsOpcoes(coluna: ColunaDosAtivos): boolean {
  if (coluna.filtro !== 'escolha') return false;
  if (coluna.chave === 'ativo.tipo' || coluna.chave === 'ativo.modelo') return true;
  if (coluna.chave === COLUNA_DA_DISPONIBILIDADE || coluna.chave === COLUNA_DO_CONTROL_ID) {
    return true;
  }
  return coluna.campo?.tipo === 'lista' || coluna.campo?.tipo === 'lista-multipla';
}

/** Quanto tempo a contagem de uma coluna vale sem ser pedida de novo. */
const VALIDADE_DAS_CONTAGENS = 30_000;

/**
 * Quantos ativos cada opção da coluna traz, com a busca e os outros filtros (decisão 2): pedida só
 * quando o editor da coluna abre, guardada por 30 s e relida pelo evento dos ativos. Ausente enquanto
 * não chega e nas colunas que não contam.
 */
export function useContagensDaColuna(
  coluna: ColunaDosAtivos | undefined,
  busca: string,
  filtros: readonly FiltroDaVisao[],
): ReadonlyMap<string, number> | undefined {
  const api = useApi();
  const conta = coluna !== undefined && contaAsOpcoes(coluna);
  const pedido = {
    coluna: coluna?.chave ?? '',
    ...(busca ? { busca } : {}),
    filtros: JSON.stringify(filtros),
  };
  const contagens = useQuery({
    queryKey: [...CHAVE_DOS_ATIVOS, 'contagens', pedido],
    enabled: conta,
    staleTime: VALIDADE_DAS_CONTAGENS,
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/contagens', { params: { query: pedido } }),
        'contar os ativos',
      ),
  });
  if (!conta || !contagens.data) return undefined;
  return new Map(contagens.data.opcoes.map((opcao) => [opcao.valor, opcao.quantos]));
}

const mostrar = (quantos: number) =>
  quantos === 1 ? 'Mostrar 1 ativo' : `Mostrar ${quantos.toLocaleString('pt-BR')} ativos`;

/**
 * Várias escolhas entre as que a API devolve enquanto se digita, como as pessoas e os modelos: a
 * busca acrescenta, e cada escolhida tem o botão de tirá-la.
 */
function EscolhaDeVarios({
  rotulo,
  valores,
  aoMudar,
  buscar,
  nomeDoRegistro,
  erro,
}: {
  rotulo: string;
  valores: string[];
  aoMudar: (valores: string[]) => void;
  buscar: (texto: string, sinal: AbortSignal) => Promise<OpcaoDoFiltro[] | ResultadoDoSeletor>;
  nomeDoRegistro: NomeDoRegistro;
  erro?: string;
}) {
  // Os nomes das escolhidas pela busca, antes de a lista os trazer nas referências.
  const [nomes, definirNomes] = useState<ReadonlyMap<string, string>>(new Map());
  const nomeDe = (id: string) => nomes.get(id) ?? nomeDoRegistro(id) ?? '…';
  // A busca recomeça vazia depois de cada escolha, para a próxima.
  const [vez, definirVez] = useState(0);
  return (
    <div className={estilos.escolhaDeVarios}>
      <SeletorDeConta
        key={vez}
        rotulo={rotulo}
        valor={null}
        buscar={buscar}
        erro={erro}
        aoMudar={(escolhida) => {
          if (!escolhida || valores.includes(escolhida.id)) return;
          definirNomes((atuais) => new Map(atuais).set(escolhida.id, escolhida.rotulo));
          definirVez((atual) => atual + 1);
          aoMudar([...valores, escolhida.id]);
        }}
      />
      {valores.length > 0 && (
        <ul className={estilos.escolhidas} aria-label="Escolhidas">
          {valores.map((id) => (
            <li key={id} className={estilos.escolhida}>
              <span>{nomeDe(id)}</span>
              <BotaoDeIcone
                icone={X}
                rotulo={`Tirar ${nomeDe(id)}`}
                comDica={false}
                onPress={() => aoMudar(valores.filter((valor) => valor !== id))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface PropsDoEditorDosAtivos {
  coluna: ColunaDosAtivos;
  /** O filtro que a coluna já tem. */
  filtro: FiltroDaVisao | undefined;
  /** Os tipos de ativo do catálogo, para a escolha do tipo. */
  tipos: readonly OpcaoDoFiltro[];
  nomeDoRegistro: NomeDoRegistro;
  /** Quantos ativos cada opção traz; ausente enquanto não chega e nas colunas que não contam. */
  contagens?: ReadonlyMap<string, number>;
  /** Os tipos do filtro de Tipo: o de Modelo oferece primeiro os modelos deles. */
  tiposDoFiltro?: readonly string[];
  aoAplicar: (filtro: FiltroDaVisao) => void;
  aoTirar: () => void;
}

/** O editor do filtro de uma coluna dos ativos, com as escolhas dela. */
export function EditorDoFiltroDosAtivos({
  coluna,
  filtro,
  tipos,
  nomeDoRegistro,
  contagens,
  tiposDoFiltro = [],
  aoAplicar,
  aoTirar,
}: PropsDoEditorDosAtivos) {
  const api = useApi();
  const buscarPessoas = useCallback(
    async (busca: string, sinal: AbortSignal) => {
      const { data, error } = await api.GET('/pessoas/nomes', {
        params: { query: { busca } },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar as pessoas.');
      return data.pessoas.map((pessoa) => ({ id: pessoa.id, rotulo: pessoa.nome }));
    },
    [api],
  );
  // O fornecedor: para quem vê os fornecedores, os ativos e os inativos, pela lista da seção; para
  // os outros, os ativos da escolha (change p4a-fornecedores, decisão 3).
  const veOsFornecedores = useAcesso().pode('fornecedores.ver');
  const buscarDaEscolha = useBuscarFornecedores();
  const buscarFornecedores = useCallback(
    async (busca: string, sinal: AbortSignal) => {
      if (!veOsFornecedores) return buscarDaEscolha(busca);
      const { data, error } = await api.GET('/fornecedores', {
        params: {
          query: { ...(busca.trim() !== '' && { busca }), situacao: 'todos', limite: 50 },
        },
        signal: sinal,
      });
      if (error || !data) throw new Error('Não foi possível buscar os fornecedores.');
      return data.itens.map((fornecedor) => ({
        id: fornecedor.id,
        rotulo:
          fornecedor.situacao === 'inativo' ? `${fornecedor.nome} (inativo)` : fornecedor.nome,
      }));
    },
    [api, buscarDaEscolha, veOsFornecedores],
  );
  // Com um filtro de Tipo, os modelos dele vêm primeiro, sugeridos com o nome do tipo, e os outros
  // depois (decisão 4).
  const chaveDosTipos = tiposDoFiltro.join(',');
  const buscarModelos = useCallback(
    async (busca: string, sinal: AbortSignal): Promise<ResultadoDoSeletor> => {
      const pedir = (tiposDoPedido?: string) =>
        api.GET('/modelos', {
          params: {
            query: { busca, limite: 20, ...(tiposDoPedido ? { tipos: tiposDoPedido } : {}) },
          },
          signal: sinal,
        });
      const comoOpcao = (modelo: { id: string; fabricante: string; nome: string }) => ({
        id: modelo.id,
        rotulo: `${modelo.fabricante} ${modelo.nome}`,
      });
      const todos = await pedir();
      if (todos.error || !todos.data) throw new Error('Não foi possível buscar os modelos.');
      if (!chaveDosTipos) return { itens: todos.data.itens.map(comoOpcao) };
      const dosTipos = await pedir(chaveDosTipos);
      if (dosTipos.error || !dosTipos.data) throw new Error('Não foi possível buscar os modelos.');
      const primeiros = dosTipos.data.itens.map(comoOpcao);
      const ids = new Set(primeiros.map((modelo) => modelo.id));
      const nomesDosTipos = chaveDosTipos.split(',').map((id) => nomeDoRegistro(id));
      return {
        itens: [...primeiros, ...todos.data.itens.map(comoOpcao).filter((m) => !ids.has(m.id))],
        sugeridas: {
          ids: [...ids],
          origem:
            nomesDosTipos.length === 1 && nomesDosTipos[0]
              ? `Modelos de ${nomesDosTipos[0]}`
              : 'Modelos dos tipos filtrados',
        },
      };
    },
    [api, chaveDosTipos, nomeDoRegistro],
  );

  const campo = coluna.campo;
  const opcoesDoCampo = (campo?.configuracao?.opcoes ?? [])
    .filter(
      (opcao) =>
        opcao.situacao === 'ativa' ||
        (filtro?.operador === 'qualquer' && filtro.valores.includes(opcao.id)),
    )
    .map((opcao) => ({ id: opcao.id, rotulo: opcao.rotulo }));
  const opcoesSemContagem =
    coluna.chave === 'ativo.tipo'
      ? tipos
      : coluna.chave === COLUNA_DA_SITUACAO
        ? OPCOES_DA_SITUACAO
        : opcoesDoCampo;
  // Com a contagem, cada opção diz quantos ativos traz; a que não veio na contagem não traz nenhum.
  const opcoes = contagens
    ? opcoesSemContagem.map((opcao) => ({ ...opcao, quantos: contagens.get(opcao.id) ?? 0 }))
    : opcoesSemContagem;
  // A soma das marcadas é o resultado só quando cada ativo tem uma opção: na lista múltipla, um
  // ativo com duas marcadas contaria duas vezes.
  const resultadoDaEscolha =
    contagens && campo?.tipo !== 'lista-multipla'
      ? (valores: readonly string[]) =>
          valores.length === 0
            ? null
            : mostrar(valores.reduce((soma, valor) => soma + (contagens.get(valor) ?? 0), 0))
      : undefined;
  const buscar =
    coluna.chave === 'ativo.modelo'
      ? buscarModelos
      : campo?.tipo === 'pessoa'
        ? buscarPessoas
        : campo?.tipo === 'fornecedor'
          ? buscarFornecedores
          : null;
  const rotuloDaEscolha =
    coluna.chave === 'ativo.modelo'
      ? 'Modelos'
      : campo?.tipo === 'fornecedor'
        ? 'Fornecedores'
        : 'Pessoas';
  const { chave: _chave, ...atual } = filtro ?? { chave: coluna.chave };
  return (
    <EditorDeFiltro
      coluna={coluna.rotulo}
      tipo={coluna.filtro}
      unidade={coluna.unidade}
      podeFicarVazia={coluna.podeFicarVazia}
      filtro={filtro ? (atual as FiltroDoEditor) : null}
      opcoes={opcoes}
      resultadoDaEscolha={resultadoDaEscolha}
      seletorDeLocal={({ valor, aoMudar, erro }) => (
        <SeletorDeLocal rotulo="Local" valor={valor} aoMudar={aoMudar} erro={erro} />
      )}
      seletorDeOpcoes={
        buscar
          ? ({ valores, aoMudar, erro }) => (
              <EscolhaDeVarios
                rotulo={rotuloDaEscolha}
                valores={valores}
                aoMudar={aoMudar}
                buscar={buscar}
                nomeDoRegistro={nomeDoRegistro}
                erro={erro}
              />
            )
          : undefined
      }
      aoAplicar={(novo) => aoAplicar({ chave: coluna.chave, ...novo } as FiltroDaVisao)}
      aoTirar={aoTirar}
    />
  );
}

/**
 * Os filtros ativos em texto, como "Hostname · contém · almox", na ordem da tabela, sem o da
 * situação, que fica à vista na barra. O operador aparece quando a coluna tem mais de um, e o modelo
 * escolhido de um tipo fora do filtro de Tipo é marcado "(de outro tipo)".
 */
export function filtrosAtivos(
  filtros: readonly FiltroDaVisao[],
  colunas: ReadonlyMap<string, ColunaDosAtivos>,
  nomeDoRegistro: NomeDoRegistro,
  tiposDosModelos: Readonly<Record<string, string>> = {},
): FiltroAtivo[] {
  const doFiltro = tiposFiltrados(filtros);
  const nomeComOTipo: NomeDoRegistro = (id) => {
    const nome = nomeDoRegistro(id);
    const tipo = tiposDosModelos[id];
    if (nome === undefined || doFiltro.length === 0 || tipo === undefined) return nome;
    return doFiltro.includes(tipo) ? nome : `${nome} (de outro tipo)`;
  };
  return filtros
    .filter((filtro) => filtro.chave !== COLUNA_DA_SITUACAO)
    .map((filtro) => {
      const coluna = colunas.get(filtro.chave);
      const rotulo = coluna?.rotulo ?? filtro.chave;
      const { operador, valor } = partesDoFiltro(
        filtro,
        coluna,
        filtro.chave === 'ativo.modelo' ? nomeComOTipo : nomeDoRegistro,
      );
      const comOperador =
        operador !== null && coluna !== undefined && operadoresDa(coluna).length > 1;
      return { id: filtro.chave, rotulo, ...(comOperador ? { operador } : {}), valor };
    });
}
