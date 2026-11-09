import { ROTULOS_DOS_TIPOS_DE_SOLICITACAO, textoDaOrdem } from '@grafite/domain';
import {
  BarraDaTabela,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  type FiltroAtivo,
  FiltrosAtivos,
  haQuantoTempo,
  ItemDeMenu,
  Linha,
  Menu,
  RotuloDeSituacao,
  Selecao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { itensDasPaginas } from '../../../api/consultas.ts';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { CampoComEspera } from '../../administracao/CampoComEspera.tsx';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import {
  SeletorDeLocal,
  useCaminhoDoLocal,
} from '../../administracao/seletores/SeletorDeLocal.tsx';
import estilosDaOperacao from '../Operacao.module.css';
import { useAbrirOS } from '../ordens/useAbrirOS.ts';
import { GavetaDaAcao } from './Acoes.tsx';
import { type AcaoDaSolicitacao, acoesDaSolicitacao, ROTULOS_DAS_ACOES } from './acoes.ts';
import {
  fornecedorEmTexto,
  locaisEmTexto,
  pedidoEmTexto,
  SITUACOES_NA_TELA,
} from './apresentacao.ts';
import { type Solicitacao, useAlgumaSolicitacao, useSolicitacoes } from './consultas.ts';
import { GavetaDaNovaSolicitacao } from './Formulario.tsx';
import {
  type FiltrosDasSolicitacoes,
  OPCOES_DA_SITUACAO,
  OPCOES_DO_TIPO,
  PENDENTES,
  type SituacaoDoFiltroDasSolicitacoes,
} from './filtros.ts';
import { GavetaDoLote } from './Lote.tsx';

const TODOS = 'todos';

const contagem = (total: number) =>
  total === 1 ? '1 solicitação' : `${total.toLocaleString('pt-BR')} solicitações`;

/**
 * O endereço das solicitações: a lista, para quem vê as solicitações em algum local, e o lugar sem
 * acesso, para quem não.
 */
export function InicioDasSolicitacoes() {
  const { pode } = useAcesso();
  return pode('solicitacoes.ver') || pode('solicitacoes.atender') ? (
    <Solicitacoes />
  ) : (
    <SemPermissao a="às solicitações" />
  );
}

/**
 * A lista e, para quem atende, a nova solicitação aberta pelo endereço: pela tela, pela busca ou
 * pela ficha do ativo, com o tipo e, da ficha, a impressora ou o ativo.
 */
function Solicitacoes() {
  const filtros = useSearch({ from: '/operacao/solicitacoes/' });
  const navegar = useNavigate({ from: '/operacao/solicitacoes/' });
  const { pode } = useAcesso();
  const fechar = () =>
    void navegar({
      search: (atual) => ({ ...atual, nova: undefined, ativo: undefined }),
      replace: true,
    });
  return (
    <>
      <TelaDasSolicitacoes />
      {filtros.nova && pode('solicitacoes.atender') && (
        <GavetaDaNovaSolicitacao
          key={[filtros.nova, filtros.ativo].join('/')}
          nova={{ tipo: filtros.nova, ...(filtros.ativo ? { ativo: filtros.ativo } : {}) }}
          aoFechar={fechar}
        />
      )}
    </>
  );
}

/**
 * A tela das solicitações (spec modulo-operacao, "Tela das solicitações"): as que a conta vê, das
 * mais novas para as mais antigas, com as pendentes por padrão, paginada no servidor, com a busca e
 * os filtros no endereço. A linha abre a ficha. Quem atende seleciona as linhas, também as trazidas
 * pelo "Carregar mais", e muda a situação delas de uma vez pela barra da tabela.
 */
function TelaDasSolicitacoes() {
  const filtros = useSearch({ from: '/operacao/solicitacoes/' });
  const navegar = useNavigate({ from: '/operacao/solicitacoes/' });
  const { pode } = useAcesso();
  const atender = pode('solicitacoes.atender');
  const abreOS = pode('ordens.atender');
  const abrirOS = useAbrirOS();

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDasSolicitacoes>) =>
      void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true }),
    [navegar],
  );
  const mudarBusca = useCallback(
    (busca: string) => mudarFiltros({ busca: busca.trim() === '' ? undefined : busca }),
    [mudarFiltros],
  );
  const limparFiltros = () =>
    mudarFiltros({ busca: undefined, situacao: undefined, tipo: undefined, local: undefined });
  const novaSolicitacao = () =>
    void navegar({ search: (atual) => ({ ...atual, nova: 'toner' as const }) });

  const parametros = {
    busca: filtros.busca,
    situacao: filtros.situacao,
    tipo: filtros.tipo,
    local: filtros.local,
  };
  const solicitacoes = useSolicitacoes(parametros);
  const lista = itensDasPaginas(solicitacoes.data);
  const primeira = solicitacoes.data?.pages[0];
  const ativos = useFiltrosAtivos(filtros);
  const comFiltro = ativos.length > 0;
  // Sem nenhuma pendente e sem outro filtro: há alguma registrada, ou nenhuma ainda?
  const semPendentes = !comFiltro && primeira?.total === 0;
  const alguma = useAlgumaSolicitacao(semPendentes);

  const [selecao, definirSelecao] = useState<ReadonlySet<string>>(new Set());
  const [lote, definirLote] = useState<number[] | null>(null);
  const [emAcao, definirEmAcao] = useState<{
    acao: AcaoDaSolicitacao;
    solicitacao: Solicitacao;
  } | null>(null);
  // A busca ou um filtro que mudam limpam a seleção: ela era de outra lista.
  const daConsulta = JSON.stringify(parametros);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a seleção recomeça a cada consulta nova.
  useEffect(() => definirSelecao(new Set()), [daConsulta]);

  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Solicitações"
      acoes={
        atender && (
          <Botao nivel="primario" icone={Plus} onPress={novaSolicitacao}>
            Nova solicitação
          </Botao>
        )
      }
    />
  );

  if (solicitacoes.isPending || (semPendentes && alguma.isPending)) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        <p role="status" className={estilosDaOperacao.contagem}>
          Carregando as solicitações…
        </p>
      </div>
    );
  }
  if (solicitacoes.isError && !solicitacoes.data) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={solicitacoes.error.message}
          acao={<Botao onPress={() => void solicitacoes.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  if (semPendentes) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        {alguma.data ? (
          <EstadoVazio
            titulo="Nenhuma solicitação pendente."
            descricao="As concluídas e as canceladas estão em “Todas”."
            acao={<Botao onPress={() => mudarFiltros({ situacao: 'todas' })}>Ver todas</Botao>}
          />
        ) : (
          <EstadoVazio
            titulo="Nenhuma solicitação ainda."
            descricao="Quem atende registra o toner, o conserto ou o equipamento em nome de quem pediu."
            acao={
              atender ? (
                <Botao icone={Plus} onPress={novaSolicitacao}>
                  Nova solicitação
                </Botao>
              ) : undefined
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className={estilosDaOperacao.tela}>
      {cabecalho}
      <BarraDaTabela
        contagem={lista.length > 0 ? contagem(primeira?.total ?? 0) : null}
        filtros={
          comFiltro ? (
            <FiltrosAtivos
              filtros={ativos}
              aoLimpar={(id) => mudarFiltros({ [id]: undefined })}
              aoLimparTodos={limparFiltros}
            />
          ) : null
        }
        selecao={
          atender
            ? {
                quantas: selecao.size,
                acoes: [
                  {
                    id: 'situacao',
                    rotulo: 'Mudar a situação',
                    aoEscolher: () => definirLote([...selecao].map(Number)),
                  },
                ],
                aoLimpar: () => definirSelecao(new Set()),
              }
            : undefined
        }
      >
        <CampoComEspera
          type="search"
          rotulo="Buscar nas solicitações"
          placeholder="Número, quem pediu, patrimônio ou OS"
          valor={filtros.busca ?? ''}
          aoMudar={mudarBusca}
        />
        <Selecao
          rotulo="Situação"
          opcoes={OPCOES_DA_SITUACAO}
          selectedKey={filtros.situacao ?? PENDENTES}
          onSelectionChange={(chave) => {
            const situacao = String(chave);
            mudarFiltros({
              situacao:
                situacao === PENDENTES ? undefined : (situacao as SituacaoDoFiltroDasSolicitacoes),
            });
          }}
        />
        <Selecao
          rotulo="Tipo"
          opcoes={[{ id: TODOS, rotulo: 'Todos os tipos' }, ...OPCOES_DO_TIPO]}
          selectedKey={filtros.tipo ?? TODOS}
          onSelectionChange={(chave) => {
            const tipo = String(chave);
            mudarFiltros({
              tipo: tipo === TODOS ? undefined : (tipo as FiltrosDasSolicitacoes['tipo']),
            });
          }}
        />
        <SeletorDeLocal
          rotulo="Local"
          valor={filtros.local ?? null}
          aoMudar={(local) => mudarFiltros({ local: local ?? undefined })}
        />
      </BarraDaTabela>
      <Tabela
        rotulo="Solicitações"
        carregando={solicitacoes.isPlaceholderData}
        carregarMais={{
          haMais: solicitacoes.hasNextPage,
          carregando: solicitacoes.isFetchingNextPage,
          aoCarregar: () => void solicitacoes.fetchNextPage(),
        }}
        aoAbrirLinha={(numero) =>
          void navegar({ to: '/operacao/solicitacoes/$numero', params: { numero } })
        }
        {...(atender ? { selecao, aoMudarSelecao: definirSelecao } : {})}
      >
        <CabecalhoDaTabela>
          <Coluna id="numero" principal especie="codigo">
            Número
          </Coluna>
          <Coluna id="tipo">Tipo</Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
          <Coluna id="pessoa">Pedida por</Coluna>
          <Coluna id="pedido">Pedido</Coluna>
          <Coluna id="locais">Locais</Coluna>
          <Coluna id="fornecedor">Fornecedor</Coluna>
          <Coluna id="registrada" especie="data">
            Registrada
          </Coluna>
          {atender && (
            <Coluna id="acoes" especie="acoes">
              Ações
            </Coluna>
          )}
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={lista}
          vazio={
            <EstadoVazio
              titulo="Nenhuma solicitação com esses filtros."
              acao={<Botao onPress={limparFiltros}>Limpar filtros</Botao>}
            />
          }
        >
          {(solicitacao) => (
            <LinhaDaSolicitacao
              solicitacao={solicitacao}
              comAcoes={atender}
              abreOS={abreOS}
              aoAgir={(acao) =>
                acao === 'abrir-os'
                  ? void abrirOS(solicitacao.numero)
                  : definirEmAcao({ acao, solicitacao })
              }
            />
          )}
        </CorpoDaTabela>
      </Tabela>
      {lote && (
        <GavetaDoLote
          numeros={lote}
          aoFechar={() => definirLote(null)}
          aoMudar={() => {
            definirSelecao(new Set());
            definirLote(null);
          }}
        />
      )}
      {emAcao && (
        <GavetaDaAcao
          key={`${emAcao.acao}/${emAcao.solicitacao.numero}`}
          acao={emAcao.acao}
          solicitacao={emAcao.solicitacao}
          aoFechar={() => definirEmAcao(null)}
        />
      )}
    </div>
  );
}

function LinhaDaSolicitacao({
  solicitacao,
  comAcoes,
  abreOS,
  aoAgir,
}: {
  solicitacao: Solicitacao;
  /** A tabela tem a coluna das ações: a conta atende as solicitações em algum local. */
  comAcoes: boolean;
  /** A conta também atende as OS, e o conserto oferece "Abrir OS". */
  abreOS: boolean;
  aoAgir: (acao: AcaoDaSolicitacao) => void;
}) {
  const agora = useAgora();
  const { formatarDataEHora } = useDataHora();
  const situacao = SITUACOES_NA_TELA[solicitacao.situacao];
  const fornecedor = fornecedorEmTexto(solicitacao);
  const registradaEm = new Date(solicitacao.registradaEm);
  return (
    <Linha id={String(solicitacao.numero)}>
      <Celula>
        <span className="mono">{solicitacao.numero}</span>
      </Celula>
      <Celula>{ROTULOS_DOS_TIPOS_DE_SOLICITACAO[solicitacao.tipo]}</Celula>
      <Celula>
        <RotuloDeSituacao situacao={situacao.tipo}>
          {situacao.texto}
          {solicitacao.ordem && ` · ${textoDaOrdem(solicitacao.ordem.numero)}`}
        </RotuloDeSituacao>
      </Celula>
      <Celula>{solicitacao.pessoa.nome}</Celula>
      <Celula>{pedidoEmTexto(solicitacao)}</Celula>
      <Celula>{locaisEmTexto(solicitacao)}</Celula>
      <Celula>{fornecedor ?? <span className={estilosDaOperacao.semValor}>—</span>}</Celula>
      <Celula>
        <time dateTime={solicitacao.registradaEm} title={formatarDataEHora(registradaEm)}>
          {haQuantoTempo(registradaEm, agora)}
        </time>
      </Celula>
      {comAcoes && (
        <Celula>
          <AcoesDaLinha solicitacao={solicitacao} abreOS={abreOS} aoAgir={aoAgir} />
        </Celula>
      )}
    </Linha>
  );
}

/** As ações que a situação e o tipo da solicitação permitem, num menu; sem nenhuma, nada. */
function AcoesDaLinha({
  solicitacao,
  abreOS,
  aoAgir,
}: {
  solicitacao: Solicitacao;
  abreOS: boolean;
  aoAgir: (acao: AcaoDaSolicitacao) => void;
}) {
  const acoes = acoesDaSolicitacao(solicitacao, { abreOS });
  if (acoes.length === 0) return null;
  const rotulo = `Ações da solicitação ${solicitacao.numero}`;
  return (
    <Menu
      rotulo={rotulo}
      gatilho={
        <Botao nivel="secundario" aria-label={rotulo}>
          Ações
        </Botao>
      }
    >
      {acoes.map((acao) => (
        <ItemDeMenu key={acao} id={acao} onAction={() => aoAgir(acao)}>
          {ROTULOS_DAS_ACOES[acao]}
        </ItemDeMenu>
      ))}
    </Menu>
  );
}

/** Os filtros fora do padrão, com o nome e o valor de cada um, em texto. */
function useFiltrosAtivos(filtros: FiltrosDasSolicitacoes): FiltroAtivo[] {
  const caminhoDoLocal = useCaminhoDoLocal();
  return [
    ...(filtros.busca ? [{ id: 'busca', rotulo: 'Busca', valor: filtros.busca }] : []),
    ...(filtros.situacao
      ? [
          {
            id: 'situacao',
            rotulo: 'Situação',
            valor: OPCOES_DA_SITUACAO.find((opcao) => opcao.id === filtros.situacao)?.rotulo ?? '',
          },
        ]
      : []),
    ...(filtros.tipo
      ? [{ id: 'tipo', rotulo: 'Tipo', valor: ROTULOS_DOS_TIPOS_DE_SOLICITACAO[filtros.tipo] }]
      : []),
    ...(filtros.local
      ? [{ id: 'local', rotulo: 'Local', valor: caminhoDoLocal(filtros.local) ?? '…' }]
      : []),
  ];
}
