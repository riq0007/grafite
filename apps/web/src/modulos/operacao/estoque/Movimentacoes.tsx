import {
  ROTULOS_DOS_TIPOS_DE_MOVIMENTO,
  TIPOS_DE_MOVIMENTO,
  type TipoDeMovimento,
} from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  CampoDeData,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  type FiltroAtivo,
  FiltrosAtivos,
  Linha,
  Selecao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';
import { itensDasPaginas } from '../../../api/consultas.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useBuscarFornecedores } from '../../administracao/fornecedores/escolha.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import { SeletorDeConta } from '../../administracao/seletores/SeletorDeConta.tsx';
import {
  SeletorDeLocal,
  useCaminhoDoLocal,
} from '../../administracao/seletores/SeletorDeLocal.tsx';
import estilosDaOperacao from '../Operacao.module.css';
import { detalheDoMovimento, quantidadeEscrita, rotuloDoAtivo } from './apresentacao.ts';
import { type MovimentoDoEstoque, useMovimentacoes } from './consultas.ts';
import estilos from './Estoque.module.css';
import { useBuscarConsumiveis } from './escolhas.ts';
import {
  type FiltrosDasMovimentacoes,
  periodoEmTexto,
  periodoParaAApi,
} from './filtrosDasMovimentacoes.ts';

const TODOS = 'todos';

const contagem = (total: number) =>
  total === 1 ? '1 movimentação' : `${total.toLocaleString('pt-BR')} movimentações`;

const OPCOES_DE_TIPO = TIPOS_DE_MOVIMENTO.map((id) => ({
  id,
  rotulo: ROTULOS_DOS_TIPOS_DE_MOVIMENTO[id],
}));

/** O endereço das movimentações: o livro-razão, para quem vê o estoque. */
export function InicioDasMovimentacoes() {
  const { pode } = useAcesso();
  return pode('estoque.ver') || pode('estoque.movimentar') ? (
    <Movimentacoes />
  ) : (
    <SemPermissao a="às movimentações do estoque" />
  );
}

/**
 * A tela das movimentações (spec modulo-operacao, "Movimentações"): o livro-razão dos locais que a
 * conta vê, da mais nova para a mais antiga, com o momento no fuso escolhido, o tipo, o consumível
 * e a quantidade, os locais, o detalhe do tipo, a observação e quem lançou, paginado no servidor,
 * com os filtros no endereço e em texto.
 */
function Movimentacoes() {
  const filtros = useSearch({ from: '/operacao/movimentacoes' });
  const navegar = useNavigate({ from: '/operacao/movimentacoes' });
  const dataHora = useDataHora();
  const buscarConsumiveis = useBuscarConsumiveis();
  const buscarFornecedores = useBuscarFornecedores();

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDasMovimentacoes>) =>
      void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true }),
    [navegar],
  );
  const limparFiltros = () =>
    mudarFiltros({
      de: undefined,
      ate: undefined,
      tipo: undefined,
      local: undefined,
      consumivel: undefined,
      fornecedor: undefined,
      ativo: undefined,
    });

  const movimentacoes = useMovimentacoes({
    ...periodoParaAApi(filtros, dataHora),
    tipo: filtros.tipo,
    local: filtros.local,
    consumivel: filtros.consumivel,
    fornecedor: filtros.fornecedor,
    ativo: filtros.ativo,
  });
  const lista = itensDasPaginas(movimentacoes.data);
  const primeira = movimentacoes.data?.pages[0];
  const rotulos = rotulosDosFiltros(filtros, lista);
  const ativos = useFiltrosAtivos(filtros, rotulos);
  const comFiltro = ativos.length > 0;

  const cabecalho = <CabecalhoDaPagina titulo="Movimentações" />;
  if (movimentacoes.isPending) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        <p role="status" className={estilosDaOperacao.contagem}>
          Carregando as movimentações…
        </p>
      </div>
    );
  }
  if (movimentacoes.isError && !movimentacoes.data) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={movimentacoes.error.message}
          acao={<Botao onPress={() => void movimentacoes.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }

  return (
    <div className={estilosDaOperacao.tela}>
      {cabecalho}
      <div className={estilosDaOperacao.filtros}>
        <CampoDeData
          rotulo="De"
          valor={filtros.de ?? null}
          aoMudar={(de) => mudarFiltros({ de: de ?? undefined })}
        />
        <CampoDeData
          rotulo="Até"
          valor={filtros.ate ?? null}
          aoMudar={(ate) => mudarFiltros({ ate: ate ?? undefined })}
          erro={
            filtros.de && filtros.ate && filtros.de > filtros.ate
              ? 'A data de fim vem antes da de início.'
              : undefined
          }
        />
        <Selecao
          rotulo="Tipo"
          opcoes={[{ id: TODOS, rotulo: 'Todos os tipos' }, ...OPCOES_DE_TIPO]}
          selectedKey={filtros.tipo ?? TODOS}
          onSelectionChange={(chave) => {
            const tipo = String(chave);
            mudarFiltros({ tipo: tipo === TODOS ? undefined : (tipo as TipoDeMovimento) });
          }}
        />
        <SeletorDeLocal
          rotulo="Local"
          valor={filtros.local ?? null}
          aoMudar={(local) => mudarFiltros({ local: local ?? undefined })}
        />
        <SeletorDeConta
          rotulo="Consumível"
          valor={
            filtros.consumivel ? { id: filtros.consumivel, rotulo: rotulos.consumivel ?? '' } : null
          }
          aoMudar={(escolhido) => mudarFiltros({ consumivel: escolhido?.id })}
          buscar={buscarConsumiveis}
        />
        <SeletorDeConta
          rotulo="Fornecedor"
          valor={
            filtros.fornecedor ? { id: filtros.fornecedor, rotulo: rotulos.fornecedor ?? '' } : null
          }
          aoMudar={(escolhido) => mudarFiltros({ fornecedor: escolhido?.id })}
          buscar={buscarFornecedores}
        />
      </div>
      <FiltrosAtivos
        filtros={ativos}
        aoLimpar={(id) =>
          mudarFiltros(id === 'periodo' ? { de: undefined, ate: undefined } : { [id]: undefined })
        }
        aoLimparTodos={limparFiltros}
      />
      {lista.length > 0 && (
        <p className={estilosDaOperacao.contagem}>{contagem(primeira?.total ?? 0)}</p>
      )}
      <Tabela
        rotulo="Movimentações"
        carregarMais={{
          haMais: movimentacoes.hasNextPage,
          carregando: movimentacoes.isFetchingNextPage,
          aoCarregar: () => void movimentacoes.fetchNextPage(),
        }}
      >
        <CabecalhoDaTabela>
          <Coluna id="momento" principal especie="data">
            Momento
          </Coluna>
          <Coluna id="tipo">Tipo</Coluna>
          <Coluna id="consumivel" especie="codigo">
            Consumível
          </Coluna>
          <Coluna id="quantidade" alinhamento="fim" especie="numero">
            Quantidade
          </Coluna>
          <Coluna id="origem">Origem</Coluna>
          <Coluna id="destino">Destino</Coluna>
          <Coluna id="detalhe">Detalhe</Coluna>
          <Coluna id="observacao">Observação</Coluna>
          <Coluna id="lancadoPor">Lançado por</Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={lista}
          vazio={
            <EstadoVazio
              titulo="Nenhuma movimentação encontrada."
              acao={comFiltro ? <Botao onPress={limparFiltros}>Limpar filtros</Botao> : undefined}
            />
          }
        >
          {(movimento) => <LinhaDaMovimentacao movimento={movimento} />}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

function LinhaDaMovimentacao({ movimento }: { movimento: MovimentoDoEstoque }) {
  const dataHora = useDataHora();
  const semValor = <span className={estilosDaOperacao.semValor}>—</span>;
  const detalhe = detalheDoMovimento(movimento, dataHora).filter(Boolean);
  const { consumivel } = movimento;
  return (
    <Linha id={movimento.id}>
      <Celula>{dataHora.formatarDataEHora(new Date(movimento.momento))}</Celula>
      <Celula>{ROTULOS_DOS_TIPOS_DE_MOVIMENTO[movimento.tipo]}</Celula>
      <Celula>
        {consumivel.abrir ? (
          <Link
            to="/operacao/consumiveis/$id"
            params={{ id: consumivel.id }}
            className={`mono ${estilosDaOperacao.link}`}
          >
            {consumivel.codigo}
          </Link>
        ) : (
          <span className="mono">{consumivel.codigo}</span>
        )}
      </Celula>
      <Celula>{quantidadeEscrita(movimento.quantidade)}</Celula>
      <Celula>{movimento.origem?.caminho ?? semValor}</Celula>
      <Celula>{movimento.destino?.caminho ?? semValor}</Celula>
      <Celula>
        {detalhe.length > 0 ? (
          <span className={estilos.consumivel}>
            {detalhe.map((linha) => (
              <span key={linha}>{linha}</span>
            ))}
          </span>
        ) : (
          semValor
        )}
      </Celula>
      <Celula>{movimento.observacao ?? semValor}</Celula>
      <Celula>{movimento.lancadoPor.nome}</Celula>
    </Linha>
  );
}

/**
 * Os nomes do consumível, do fornecedor e do ativo filtrados, pelas linhas, que são todas deles:
 * quem vê o estoque os lê como referência, sem as permissões deles.
 */
function rotulosDosFiltros(
  filtros: FiltrosDasMovimentacoes,
  lista: MovimentoDoEstoque[],
): { consumivel?: string; fornecedor?: string; ativo?: string } {
  const consumivel = lista.find((m) => m.consumivel.id === filtros.consumivel)?.consumivel;
  const fornecedor = lista.find((m) => m.fornecedor?.id === filtros.fornecedor)?.fornecedor;
  const ativo = lista.find((m) => m.ativo?.id === filtros.ativo)?.ativo;
  return {
    ...(consumivel && { consumivel: consumivel.codigo }),
    ...(fornecedor && { fornecedor: fornecedor.nome }),
    ...(ativo && { ativo: rotuloDoAtivo(ativo) }),
  };
}

/** Os filtros fora do padrão, com o nome e o valor de cada um, em texto. */
function useFiltrosAtivos(
  filtros: FiltrosDasMovimentacoes,
  rotulos: ReturnType<typeof rotulosDosFiltros>,
): FiltroAtivo[] {
  const caminhoDoLocal = useCaminhoDoLocal();
  const periodo = periodoEmTexto(filtros);
  return [
    ...(periodo ? [{ id: 'periodo', rotulo: 'Período', valor: periodo }] : []),
    ...(filtros.tipo
      ? [{ id: 'tipo', rotulo: 'Tipo', valor: ROTULOS_DOS_TIPOS_DE_MOVIMENTO[filtros.tipo] }]
      : []),
    ...(filtros.local
      ? [{ id: 'local', rotulo: 'Local', valor: caminhoDoLocal(filtros.local) ?? '…' }]
      : []),
    ...(filtros.consumivel
      ? [{ id: 'consumivel', rotulo: 'Consumível', valor: rotulos.consumivel ?? '…' }]
      : []),
    ...(filtros.fornecedor
      ? [{ id: 'fornecedor', rotulo: 'Fornecedor', valor: rotulos.fornecedor ?? '…' }]
      : []),
    ...(filtros.ativo ? [{ id: 'ativo', rotulo: 'Ativo', valor: rotulos.ativo ?? '…' }] : []),
  ];
}
