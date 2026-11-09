import type { TipoDeMovimento } from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  type FiltroAtivo,
  FiltrosAtivos,
  ItemDeMenu,
  Linha,
  Menu,
  RotuloDeSituacao,
  Selecao,
  Tabela,
} from '@grafite/ui';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Scale } from 'lucide-react';
import { useCallback, useState } from 'react';
import { itensDasPaginas } from '../../../api/consultas.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { CampoComEspera } from '../../administracao/CampoComEspera.tsx';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import {
  SeletorDeLocal,
  useCaminhoDoLocal,
} from '../../administracao/seletores/SeletorDeLocal.tsx';
import estilosDaOperacao from '../Operacao.module.css';
import {
  descricaoDoConsumivel,
  minimoEscrito,
  quantidadeEscrita,
  SITUACOES_DO_SALDO_NA_TELA,
} from './apresentacao.ts';
import { type SaldoDoEstoque, useSaldos } from './consultas.ts';
import estilos from './Estoque.module.css';
import {
  type FiltrosDoEstoque,
  OPCOES_DE_TIPO,
  SITUACOES_DO_FILTRO,
  type SituacaoDoFiltroDoEstoque,
} from './filtros.ts';
import { GavetaDoLancamento, type LancamentoAberto } from './Lancamento.tsx';
import { GavetaDoMinimo } from './Minimo.tsx';

const TODOS = 'todos';

const contagem = (total: number) =>
  total === 1 ? '1 saldo' : `${total.toLocaleString('pt-BR')} saldos`;

/** As ações de lançar, na ordem da tela. */
const LANCAMENTOS: readonly { tipo: TipoDeMovimento; rotulo: string; icone: typeof Scale }[] = [
  { tipo: 'entrada', rotulo: 'Entrada', icone: ArrowDownToLine },
  { tipo: 'saida', rotulo: 'Saída', icone: ArrowUpFromLine },
  { tipo: 'transferencia', rotulo: 'Transferência', icone: ArrowRightLeft },
  { tipo: 'ajuste', rotulo: 'Ajuste', icone: Scale },
];

/** O endereço do estoque: os saldos, para quem vê o estoque, e o lugar sem acesso, para quem não. */
export function InicioDoEstoque() {
  const { pode } = useAcesso();
  return pode('estoque.ver') || pode('estoque.movimentar') ? (
    <Estoque />
  ) : (
    <SemPermissao a="ao estoque" />
  );
}

/**
 * A tela do estoque (spec modulo-operacao, "Tela do estoque"): os saldos dos consumíveis nos locais
 * que a conta vê, pelo código e pelo caminho do local, com o saldo, o mínimo e a situação em texto,
 * paginada no servidor, com a busca e os filtros no endereço. Quem movimenta o estoque lança por
 * aqui, e o lançamento aberto fica no endereço.
 */
function Estoque() {
  const filtros = useSearch({ from: '/operacao/estoque' });
  const navegar = useNavigate({ from: '/operacao/estoque' });
  // O lançamento aberto por uma linha vem com o consumível e o local dela; o do endereço, pela busca
  // ou pela ficha do ativo, com o consumível e o ativo pelo id.
  const [daLinha, definirDaLinha] = useState<LancamentoAberto | null>(null);
  const [minimoDe, definirMinimoDe] = useState<SaldoDoEstoque | null>(null);
  const doEndereco: LancamentoAberto | null = filtros.lancar
    ? {
        tipo: filtros.lancar,
        ...(filtros.consumivel ? { consumivel: { id: filtros.consumivel } } : {}),
        ...(filtros.ativo ? { ativo: filtros.ativo } : {}),
      }
    : null;
  const aberto = daLinha ?? doEndereco;
  const fechar = () => {
    definirDaLinha(null);
    if (filtros.lancar) {
      void navegar({
        search: (atual) => ({ ...atual, lancar: undefined, ativo: undefined }),
        replace: true,
      });
    }
  };
  return (
    <>
      <TelaDoEstoque aoLancarDaLinha={definirDaLinha} aoDefinirMinimo={definirMinimoDe} />
      {minimoDe && (
        <GavetaDoMinimo key={minimoDe.id} saldo={minimoDe} aoFechar={() => definirMinimoDe(null)} />
      )}
      {aberto && (
        <GavetaDoLancamento
          key={[aberto.tipo, aberto.consumivel?.id, aberto.local, aberto.ativo].join('/')}
          lancamento={aberto}
          aoFechar={fechar}
        />
      )}
    </>
  );
}

function TelaDoEstoque({
  aoLancarDaLinha,
  aoDefinirMinimo,
}: {
  aoLancarDaLinha: (lancamento: LancamentoAberto) => void;
  aoDefinirMinimo: (saldo: SaldoDoEstoque) => void;
}) {
  const filtros = useSearch({ from: '/operacao/estoque' });
  const navegar = useNavigate({ from: '/operacao/estoque' });

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDoEstoque>) =>
      void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true }),
    [navegar],
  );
  const mudarBusca = useCallback(
    (busca: string) => mudarFiltros({ busca: busca.trim() === '' ? undefined : busca }),
    [mudarFiltros],
  );
  const limparFiltros = () =>
    mudarFiltros({
      busca: undefined,
      local: undefined,
      consumivel: undefined,
      tipo: undefined,
      situacao: undefined,
    });
  const lancar = (tipo: TipoDeMovimento) =>
    void navegar({ search: (atual) => ({ ...atual, lancar: tipo }) });

  const saldos = useSaldos({
    busca: filtros.busca,
    local: filtros.local,
    consumivel: filtros.consumivel,
    tipo: filtros.tipo,
    situacao: filtros.situacao,
  });
  const lista = itensDasPaginas(saldos.data);
  const primeira = saldos.data?.pages[0];
  const ativos = useFiltrosAtivos(filtros, lista);
  const comFiltro = ativos.length > 0;
  const movimentar = primeira?.permite.movimentar ?? false;

  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Estoque"
      acoes={
        movimentar &&
        LANCAMENTOS.map(({ tipo, rotulo, icone }) => (
          <Botao
            key={tipo}
            nivel={tipo === 'entrada' ? 'primario' : 'secundario'}
            icone={icone}
            onPress={() => lancar(tipo)}
          >
            {rotulo}
          </Botao>
        ))
      }
    />
  );

  if (saldos.isPending) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        <p role="status" className={estilosDaOperacao.contagem}>
          Carregando o estoque…
        </p>
      </div>
    );
  }
  if (saldos.isError && !saldos.data) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={saldos.error.message}
          acao={<Botao onPress={() => void saldos.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  // O estoque sem nenhum saldo: nada a buscar nem a filtrar.
  if (!comFiltro && primeira?.total === 0) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        <EstadoVazio
          titulo="Nenhum consumível no estoque ainda."
          descricao="O estoque começa pela entrada de um consumível num local, ou pelo ajuste do inventário."
          acao={
            movimentar ? (
              <Botao icone={ArrowDownToLine} onPress={() => lancar('entrada')}>
                Entrada
              </Botao>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className={estilosDaOperacao.tela}>
      {cabecalho}
      <div className={estilosDaOperacao.filtros}>
        <CampoComEspera
          type="search"
          rotulo="Buscar no estoque"
          placeholder="Código ou nome do consumível"
          valor={filtros.busca ?? ''}
          aoMudar={mudarBusca}
        />
        <SeletorDeLocal
          rotulo="Local"
          valor={filtros.local ?? null}
          aoMudar={(local) => mudarFiltros({ local: local ?? undefined })}
        />
        <Selecao
          rotulo="Tipo"
          opcoes={[{ id: TODOS, rotulo: 'Todos os tipos' }, ...OPCOES_DE_TIPO]}
          selectedKey={filtros.tipo ?? TODOS}
          onSelectionChange={(chave) => {
            const tipo = String(chave);
            mudarFiltros({
              tipo: tipo === TODOS ? undefined : (tipo as FiltrosDoEstoque['tipo']),
            });
          }}
        />
        <Selecao
          rotulo="Situação"
          opcoes={[
            { id: TODOS, rotulo: 'Todas as situações' },
            ...(Object.keys(SITUACOES_DO_FILTRO) as SituacaoDoFiltroDoEstoque[]).map((id) => ({
              id,
              rotulo: SITUACOES_DO_FILTRO[id],
            })),
          ]}
          selectedKey={filtros.situacao ?? TODOS}
          onSelectionChange={(chave) => {
            const situacao = String(chave);
            mudarFiltros({
              situacao: situacao === TODOS ? undefined : (situacao as SituacaoDoFiltroDoEstoque),
            });
          }}
        />
      </div>
      <FiltrosAtivos
        filtros={ativos}
        aoLimpar={(id) => mudarFiltros({ [id]: undefined })}
        aoLimparTodos={limparFiltros}
      />
      {lista.length > 0 && (
        <p className={estilosDaOperacao.contagem}>{contagem(primeira?.total ?? 0)}</p>
      )}
      <Tabela
        rotulo="Estoque"
        carregarMais={{
          haMais: saldos.hasNextPage,
          carregando: saldos.isFetchingNextPage,
          aoCarregar: () => void saldos.fetchNextPage(),
        }}
      >
        <CabecalhoDaTabela>
          <Coluna id="consumivel" principal>
            Consumível
          </Coluna>
          <Coluna id="local">Local</Coluna>
          <Coluna id="saldo" alinhamento="fim" especie="numero">
            Saldo
          </Coluna>
          <Coluna id="minimo" alinhamento="fim" especie="numero">
            Mínimo
          </Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
          {movimentar && (
            <Coluna id="acao" especie="acoes">
              Ações
            </Coluna>
          )}
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={lista}
          vazio={
            <EstadoVazio
              titulo="Nenhum saldo encontrado."
              acao={comFiltro ? <Botao onPress={limparFiltros}>Limpar filtros</Botao> : undefined}
            />
          }
        >
          {(saldo) => (
            <LinhaDoSaldo
              saldo={saldo}
              comAcoes={movimentar}
              aoLancar={aoLancarDaLinha}
              aoDefinirMinimo={aoDefinirMinimo}
            />
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

function LinhaDoSaldo({
  saldo,
  comAcoes,
  aoLancar,
  aoDefinirMinimo,
}: {
  saldo: SaldoDoEstoque;
  /** A tabela tem a coluna das ações: a conta movimenta o estoque em algum local. */
  comAcoes: boolean;
  aoLancar: (lancamento: LancamentoAberto) => void;
  aoDefinirMinimo: (saldo: SaldoDoEstoque) => void;
}) {
  const { consumivel } = saldo;
  const situacao = SITUACOES_DO_SALDO_NA_TELA[saldo.situacao];
  return (
    <Linha id={saldo.id}>
      <Celula>
        <span className={estilos.consumivel}>
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
          <span className={estilos.descricao}>{descricaoDoConsumivel(consumivel)}</span>
        </span>
      </Celula>
      <Celula>{saldo.local.caminho}</Celula>
      <Celula>{quantidadeEscrita(saldo.saldo)}</Celula>
      <Celula>{minimoEscrito(saldo.minimo)}</Celula>
      <Celula>
        <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>
      </Celula>
      {comAcoes && (
        <Celula>
          {saldo.permite.movimentar && (
            <span className={estilos.lancamentos}>
              <Botao
                nivel="secundario"
                aria-label={`Definir mínimo do ${consumivel.codigo} em ${saldo.local.caminho}`}
                onPress={() => aoDefinirMinimo(saldo)}
              >
                Definir mínimo
              </Botao>
              <Menu
                rotulo={`Lançar ${consumivel.codigo} em ${saldo.local.caminho}`}
                gatilho={
                  <Botao
                    nivel="secundario"
                    aria-label={`Lançar ${consumivel.codigo} em ${saldo.local.caminho}`}
                  >
                    Lançar
                  </Botao>
                }
              >
                {LANCAMENTOS.map(({ tipo, rotulo, icone }) => (
                  <ItemDeMenu
                    key={tipo}
                    id={tipo}
                    icone={icone}
                    onAction={() =>
                      aoLancar({
                        tipo,
                        consumivel: { id: consumivel.id, rotulo: consumivel.codigo },
                        local: saldo.local.id,
                      })
                    }
                  >
                    {rotulo}
                  </ItemDeMenu>
                ))}
              </Menu>
            </span>
          )}
        </Celula>
      )}
    </Linha>
  );
}

/** Os filtros fora do padrão, com o nome e o valor de cada um, em texto. */
function useFiltrosAtivos(filtros: FiltrosDoEstoque, lista: SaldoDoEstoque[]): FiltroAtivo[] {
  const caminhoDoLocal = useCaminhoDoLocal();
  // O código do consumível vem das linhas, que são todas dele.
  const doConsumivel = lista.find((saldo) => saldo.consumivel.id === filtros.consumivel);
  return [
    ...(filtros.busca ? [{ id: 'busca', rotulo: 'Busca', valor: filtros.busca }] : []),
    ...(filtros.consumivel
      ? [
          {
            id: 'consumivel',
            rotulo: 'Consumível',
            valor: doConsumivel?.consumivel.codigo ?? '…',
          },
        ]
      : []),
    ...(filtros.local
      ? [{ id: 'local', rotulo: 'Local', valor: caminhoDoLocal(filtros.local) ?? '…' }]
      : []),
    ...(filtros.tipo
      ? [
          {
            id: 'tipo',
            rotulo: 'Tipo',
            valor: OPCOES_DE_TIPO.find((opcao) => opcao.id === filtros.tipo)?.rotulo ?? '',
          },
        ]
      : []),
    ...(filtros.situacao
      ? [{ id: 'situacao', rotulo: 'Situação', valor: SITUACOES_DO_FILTRO[filtros.situacao] }]
      : []),
  ];
}
