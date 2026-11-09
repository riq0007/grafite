import {
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  rendimentoEscrito,
} from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ControleSegmentado,
  CorpoDaTabela,
  EstadoVazio,
  type FiltroAtivo,
  FiltrosAtivos,
  Linha,
  RotuloDeSituacao,
  Segmento,
  Selecao,
  Tabela,
} from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback } from 'react';
import { itensDasPaginas } from '../../../api/consultas.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { CampoComEspera } from '../../administracao/CampoComEspera.tsx';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import { SITUACOES_DO_REGISTRO } from '../../administracao/situacoes.ts';
import estilos from '../Operacao.module.css';
import { useConsumiveis } from './consultas.ts';
import {
  type FiltrosDosConsumiveis,
  OPCOES_DE_COR,
  OPCOES_DE_TIPO,
  SITUACOES_DO_FILTRO,
  type SituacaoDoFiltro,
} from './filtros.ts';

const TODOS = 'todos';

const contagem = (total: number) =>
  total === 1 ? '1 consumível' : `${total.toLocaleString('pt-BR')} consumíveis`;

const modelosEscritos = (modelos: number) =>
  modelos === 1 ? '1 modelo' : `${modelos.toLocaleString('pt-BR')} modelos`;

/** O endereço da lista: os consumíveis, para quem os vê, e o lugar sem acesso, para quem não vê. */
export function InicioDosConsumiveis() {
  const { pode } = useAcesso();
  return pode('consumiveis.ver') || pode('consumiveis.editar') ? (
    <Consumiveis />
  ) : (
    <SemPermissao a="à Operação" />
  );
}

/**
 * A lista dos consumíveis (spec modulo-operacao, "Lista dos consumíveis"): os ativos pelo código,
 * com o nome, o tipo, a cor, o rendimento, quantos modelos compatíveis e a situação, paginada no
 * servidor, com a busca pelo código e pelo nome, os filtros do tipo, da cor e da situação, à vista
 * e em texto, no endereço.
 */
function Consumiveis() {
  const filtros = useSearch({ from: '/operacao/consumiveis/' });
  const navegar = useNavigate({ from: '/operacao/consumiveis/' });

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDosConsumiveis>) =>
      void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true }),
    [navegar],
  );
  const mudarBusca = useCallback(
    (busca: string) => mudarFiltros({ busca: busca.trim() === '' ? undefined : busca }),
    [mudarFiltros],
  );
  const limparFiltros = () =>
    void navegar({
      search: (atual) => ({
        ...atual,
        busca: undefined,
        tipo: undefined,
        cor: undefined,
        situacao: undefined,
      }),
      replace: true,
    });

  const situacao: SituacaoDoFiltro = filtros.situacao ?? 'ativos';
  const consumiveis = useConsumiveis({
    busca: filtros.busca,
    tipo: filtros.tipo,
    cor: filtros.cor,
    situacao,
  });
  const lista = itensDasPaginas(consumiveis.data);
  const primeira = consumiveis.data?.pages[0];
  const ativos = filtrosAtivos(filtros);
  const comFiltro = ativos.length > 0;
  const cadastrar = primeira?.permite.cadastrar ?? false;
  const novoConsumivel = () => void navegar({ to: '/operacao/consumiveis/novo' });

  const botaoDoNovo = (
    <Botao nivel="primario" icone={Plus} onPress={novoConsumivel}>
      Novo consumível
    </Botao>
  );
  const cabecalho = <CabecalhoDaPagina titulo="Consumíveis" acoes={cadastrar && botaoDoNovo} />;

  if (consumiveis.isPending) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <p role="status" className={estilos.contagem}>
          Carregando os consumíveis…
        </p>
      </div>
    );
  }
  if (consumiveis.isError && !consumiveis.data) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={consumiveis.error.message}
          acao={<Botao onPress={() => void consumiveis.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  // A organização sem nenhum consumível: nada a buscar nem a filtrar.
  if (!comFiltro && primeira?.total === 0) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo="Nenhum consumível ainda."
          descricao="O consumível é o que se troca nos equipamentos, como o toner e o cilindro."
          acao={cadastrar ? botaoDoNovo : undefined}
        />
      </div>
    );
  }

  const semValor = <span className={estilos.semValor}>—</span>;
  return (
    <div className={estilos.tela}>
      {cabecalho}
      <div className={estilos.filtros}>
        <CampoComEspera
          type="search"
          rotulo="Buscar consumíveis"
          placeholder="Código ou nome"
          valor={filtros.busca ?? ''}
          aoMudar={mudarBusca}
        />
        <Selecao
          rotulo="Tipo"
          opcoes={[{ id: TODOS, rotulo: 'Todos os tipos' }, ...OPCOES_DE_TIPO]}
          selectedKey={filtros.tipo ?? TODOS}
          onSelectionChange={(chave) => {
            const tipo = String(chave);
            mudarFiltros({
              tipo: tipo === TODOS ? undefined : (tipo as FiltrosDosConsumiveis['tipo']),
            });
          }}
        />
        <Selecao
          rotulo="Cor"
          opcoes={[{ id: TODOS, rotulo: 'Todas as cores' }, ...OPCOES_DE_COR]}
          selectedKey={filtros.cor ?? TODOS}
          onSelectionChange={(chave) => {
            const cor = String(chave);
            mudarFiltros({
              cor: cor === TODOS ? undefined : (cor as FiltrosDosConsumiveis['cor']),
            });
          }}
        />
        <ControleSegmentado
          rotulo="Situação"
          value={situacao}
          onChange={(escolhida) =>
            mudarFiltros({
              situacao: escolhida === 'inativos' || escolhida === 'todos' ? escolhida : undefined,
            })
          }
        >
          {(Object.keys(SITUACOES_DO_FILTRO) as SituacaoDoFiltro[]).map((chave) => (
            <Segmento key={chave} value={chave}>
              {SITUACOES_DO_FILTRO[chave]}
            </Segmento>
          ))}
        </ControleSegmentado>
      </div>
      <FiltrosAtivos
        filtros={ativos}
        aoLimpar={(id) => mudarFiltros({ [id]: undefined })}
        aoLimparTodos={limparFiltros}
      />
      {lista.length > 0 && <p className={estilos.contagem}>{contagem(primeira?.total ?? 0)}</p>}
      <Tabela
        rotulo="Consumíveis"
        aoAbrirLinha={(id) =>
          void navegar({ to: '/operacao/consumiveis/$id', params: { id: String(id) } })
        }
        carregarMais={{
          haMais: consumiveis.hasNextPage,
          carregando: consumiveis.isFetchingNextPage,
          aoCarregar: () => void consumiveis.fetchNextPage(),
        }}
      >
        <CabecalhoDaTabela>
          <Coluna id="codigo" principal especie="codigo">
            Código
          </Coluna>
          <Coluna id="nome">Nome</Coluna>
          <Coluna id="tipo">Tipo</Coluna>
          <Coluna id="cor">Cor</Coluna>
          <Coluna id="rendimento" especie="numero">
            Rendimento
          </Coluna>
          <Coluna id="modelos">Modelos</Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={lista}
          vazio={
            <EstadoVazio
              titulo="Nenhum consumível encontrado."
              acao={comFiltro ? <Botao onPress={limparFiltros}>Limpar filtros</Botao> : undefined}
            />
          }
        >
          {(consumivel) => (
            <Linha id={consumivel.id}>
              <Celula>
                <span className="mono">{consumivel.codigo}</span>
              </Celula>
              <Celula>{consumivel.nome ?? semValor}</Celula>
              <Celula>{ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[consumivel.tipo]}</Celula>
              <Celula>
                {consumivel.cor ? ROTULOS_DAS_CORES_DE_CONSUMIVEL[consumivel.cor] : semValor}
              </Celula>
              <Celula>
                {consumivel.rendimento !== null
                  ? rendimentoEscrito(consumivel.rendimento)
                  : semValor}
              </Celula>
              <Celula>
                {consumivel.modelos > 0 ? modelosEscritos(consumivel.modelos) : semValor}
              </Celula>
              <Celula>
                <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[consumivel.situacao].tipo}>
                  {SITUACOES_DO_REGISTRO[consumivel.situacao].texto}
                </RotuloDeSituacao>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

/** Os filtros fora do padrão, com o nome e o valor de cada um, em texto. */
function filtrosAtivos(filtros: FiltrosDosConsumiveis): FiltroAtivo[] {
  return [
    ...(filtros.busca ? [{ id: 'busca', rotulo: 'Busca', valor: filtros.busca }] : []),
    ...(filtros.tipo
      ? [{ id: 'tipo', rotulo: 'Tipo', valor: ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[filtros.tipo] }]
      : []),
    ...(filtros.cor
      ? [{ id: 'cor', rotulo: 'Cor', valor: ROTULOS_DAS_CORES_DE_CONSUMIVEL[filtros.cor] }]
      : []),
    ...(filtros.situacao
      ? [{ id: 'situacao', rotulo: 'Situação', valor: SITUACOES_DO_FILTRO[filtros.situacao] }]
      : []),
  ];
}
