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
import { GavetaDaAcaoDaOrdem } from './Acoes.tsx';
import { type AcaoDaOrdem, acoesDaOrdem, ROTULOS_DAS_ACOES_DA_ORDEM } from './acoes.ts';
import { ativoEmTexto, SITUACOES_DA_ORDEM_NA_TELA } from './apresentacao.ts';
import { type OrdemDeServico, useAlgumaOrdem, useOrdens } from './consultas.ts';
import { GavetaDaNovaOrdem } from './Formulario.tsx';
import {
  EM_ABERTO,
  type FiltrosDasOrdens,
  OPCOES_DA_SITUACAO,
  type SituacaoDoFiltroDasOrdens,
} from './filtros.ts';
import { GavetaDoLoteDasOrdens } from './Lote.tsx';

const contagem = (total: number) =>
  total === 1 ? '1 ordem de serviço' : `${total.toLocaleString('pt-BR')} ordens de serviço`;

/**
 * O endereço das ordens de serviço: a lista, para quem vê as OS em algum local, e o lugar sem
 * acesso, para quem não.
 */
export function InicioDasOrdens() {
  const { pode } = useAcesso();
  return pode('ordens.ver') || pode('ordens.atender') ? (
    <Ordens />
  ) : (
    <SemPermissao a="às ordens de serviço" />
  );
}

/** A lista e, para quem atende, a nova OS aberta pelo endereço: pela tela, pela busca ou pela ficha do ativo. */
function Ordens() {
  const filtros = useSearch({ from: '/operacao/ordens/' });
  const navegar = useNavigate({ from: '/operacao/ordens/' });
  const { pode } = useAcesso();
  const fechar = () =>
    void navegar({
      search: (atual) => ({ ...atual, nova: undefined, ativo: undefined }),
      replace: true,
    });
  return (
    <>
      <TelaDasOrdens />
      {filtros.nova && pode('ordens.atender') && (
        <GavetaDaNovaOrdem
          key={filtros.ativo ?? ''}
          {...(filtros.ativo ? { ativo: filtros.ativo } : {})}
          aoFechar={fechar}
        />
      )}
    </>
  );
}

/**
 * A tela das ordens de serviço (spec modulo-operacao, "Tela das ordens de serviço"): as que a conta
 * vê, das mais novas para as mais antigas, com as em aberto por padrão, paginada no servidor, com a
 * busca e os filtros no endereço. Quem atende seleciona as linhas, também as trazidas pelo "Carregar
 * mais", e muda a situação delas de uma vez pela barra da tabela.
 */
function TelaDasOrdens() {
  const filtros = useSearch({ from: '/operacao/ordens/' });
  const navegar = useNavigate({ from: '/operacao/ordens/' });
  const { pode } = useAcesso();
  const atender = pode('ordens.atender');

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDasOrdens>) =>
      void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true }),
    [navegar],
  );
  const mudarBusca = useCallback(
    (busca: string) => mudarFiltros({ busca: busca.trim() === '' ? undefined : busca }),
    [mudarFiltros],
  );
  const limparFiltros = () =>
    mudarFiltros({ busca: undefined, situacao: undefined, local: undefined });
  const novaOrdem = () => void navegar({ search: (atual) => ({ ...atual, nova: true as const }) });

  const parametros = { busca: filtros.busca, situacao: filtros.situacao, local: filtros.local };
  const ordens = useOrdens(parametros);
  const lista = itensDasPaginas(ordens.data);
  const primeira = ordens.data?.pages[0];
  const ativos = useFiltrosAtivos(filtros);
  const comFiltro = ativos.length > 0;
  // Sem nenhuma em aberto e sem outro filtro: há alguma aberta, ou nenhuma ainda?
  const semEmAberto = !comFiltro && primeira?.total === 0;
  const alguma = useAlgumaOrdem(semEmAberto);

  const [selecao, definirSelecao] = useState<ReadonlySet<string>>(new Set());
  const [lote, definirLote] = useState<number[] | null>(null);
  const [emAcao, definirEmAcao] = useState<{ acao: AcaoDaOrdem; ordem: OrdemDeServico } | null>(
    null,
  );
  // A busca ou um filtro que mudam limpam a seleção: ela era de outra lista.
  const daConsulta = JSON.stringify(parametros);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a seleção recomeça a cada consulta nova.
  useEffect(() => definirSelecao(new Set()), [daConsulta]);

  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Ordens de serviço"
      acoes={
        atender && (
          <Botao nivel="primario" icone={Plus} onPress={novaOrdem}>
            Nova ordem de serviço
          </Botao>
        )
      }
    />
  );

  if (ordens.isPending || (semEmAberto && alguma.isPending)) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        <p role="status" className={estilosDaOperacao.contagem}>
          Carregando as ordens de serviço…
        </p>
      </div>
    );
  }
  if (ordens.isError && !ordens.data) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={ordens.error.message}
          acao={<Botao onPress={() => void ordens.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  if (semEmAberto) {
    return (
      <div className={estilosDaOperacao.tela}>
        {cabecalho}
        {alguma.data ? (
          <EstadoVazio
            titulo="Nenhuma ordem de serviço em aberto."
            descricao="As resolvidas e as encerradas estão em “Todas”."
            acao={<Botao onPress={() => mudarFiltros({ situacao: 'todas' })}>Ver todas</Botao>}
          />
        ) : (
          <EstadoVazio
            titulo="Nenhuma ordem de serviço ainda."
            descricao="Quem atende abre a OS no ativo, direto ou pela solicitação de conserto."
            acao={
              atender ? (
                <Botao icone={Plus} onPress={novaOrdem}>
                  Nova ordem de serviço
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
          rotulo="Buscar nas ordens de serviço"
          placeholder="Número, patrimônio, problema ou OS do fornecedor"
          valor={filtros.busca ?? ''}
          aoMudar={mudarBusca}
        />
        <Selecao
          rotulo="Situação"
          opcoes={OPCOES_DA_SITUACAO}
          selectedKey={filtros.situacao ?? EM_ABERTO}
          onSelectionChange={(chave) => {
            const situacao = String(chave);
            mudarFiltros({
              situacao:
                situacao === EM_ABERTO ? undefined : (situacao as SituacaoDoFiltroDasOrdens),
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
        rotulo="Ordens de serviço"
        carregando={ordens.isPlaceholderData}
        carregarMais={{
          haMais: ordens.hasNextPage,
          carregando: ordens.isFetchingNextPage,
          aoCarregar: () => void ordens.fetchNextPage(),
        }}
        aoAbrirLinha={(numero) =>
          void navegar({ to: '/operacao/ordens/$numero', params: { numero } })
        }
        {...(atender ? { selecao, aoMudarSelecao: definirSelecao } : {})}
      >
        <CabecalhoDaTabela>
          <Coluna id="numero" principal especie="codigo">
            Número
          </Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
          <Coluna id="ativo">Ativo</Coluna>
          <Coluna id="problema">Problema</Coluna>
          <Coluna id="local">Local</Coluna>
          <Coluna id="solicitacao">Solicitação</Coluna>
          <Coluna id="aberta" especie="data">
            Aberta
          </Coluna>
          <Coluna id="mudanca">Última mudança</Coluna>
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
              titulo="Nenhuma ordem de serviço com esses filtros."
              acao={<Botao onPress={limparFiltros}>Limpar filtros</Botao>}
            />
          }
        >
          {(ordem) => (
            <LinhaDaOrdem
              ordem={ordem}
              comAcoes={atender}
              aoAgir={(acao) => definirEmAcao({ acao, ordem })}
            />
          )}
        </CorpoDaTabela>
      </Tabela>
      {lote && (
        <GavetaDoLoteDasOrdens
          numeros={lote}
          aoFechar={() => definirLote(null)}
          aoMudar={() => {
            definirSelecao(new Set());
            definirLote(null);
          }}
        />
      )}
      {emAcao && (
        <GavetaDaAcaoDaOrdem
          key={`${emAcao.acao}/${emAcao.ordem.numero}`}
          acao={emAcao.acao}
          ordem={emAcao.ordem}
          aoFechar={() => definirEmAcao(null)}
        />
      )}
    </div>
  );
}

/** "Há 3 d", ou "Agora", na escrita das tabelas. */
function Idade({ momento }: { momento: string }) {
  const agora = useAgora();
  const { formatarDataEHora } = useDataHora();
  const data = new Date(momento);
  return (
    <time dateTime={momento} title={formatarDataEHora(data)}>
      {haQuantoTempo(data, agora)}
    </time>
  );
}

function LinhaDaOrdem({
  ordem,
  comAcoes,
  aoAgir,
}: {
  ordem: OrdemDeServico;
  /** A tabela tem a coluna das ações: a conta atende as OS em algum local. */
  comAcoes: boolean;
  aoAgir: (acao: AcaoDaOrdem) => void;
}) {
  const situacao = SITUACOES_DA_ORDEM_NA_TELA[ordem.situacao];
  const [ultima] = ordem.historico;
  const semValor = <span className={estilosDaOperacao.semValor}>—</span>;
  return (
    <Linha id={String(ordem.numero)}>
      <Celula>
        <span className="mono">{ordem.numero}</span>
      </Celula>
      <Celula>
        <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>
      </Celula>
      <Celula>{ativoEmTexto(ordem)}</Celula>
      <Celula>{ordem.problema}</Celula>
      <Celula>{ordem.local?.caminho ?? semValor}</Celula>
      <Celula>{ordem.solicitacao ? `Solicitação ${ordem.solicitacao.numero}` : semValor}</Celula>
      <Celula>
        <Idade momento={ordem.abertaEm} />
      </Celula>
      <Celula>
        {ultima ? (
          <>
            <Idade momento={ultima.mudadaEm} /> · {ultima.mudadaPor.nome}
          </>
        ) : (
          semValor
        )}
      </Celula>
      {comAcoes && (
        <Celula>
          <AcoesDaLinha ordem={ordem} aoAgir={aoAgir} />
        </Celula>
      )}
    </Linha>
  );
}

/** As ações que a situação da OS permite, num menu; sem nenhuma, nada. */
function AcoesDaLinha({
  ordem,
  aoAgir,
}: {
  ordem: OrdemDeServico;
  aoAgir: (acao: AcaoDaOrdem) => void;
}) {
  const acoes = acoesDaOrdem(ordem);
  if (acoes.length === 0) return null;
  const rotulo = `Ações da OS ${ordem.numero}`;
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
          {ROTULOS_DAS_ACOES_DA_ORDEM[acao]}
        </ItemDeMenu>
      ))}
    </Menu>
  );
}

/** Os filtros fora do padrão, com o nome e o valor de cada um, em texto. */
function useFiltrosAtivos(filtros: FiltrosDasOrdens): FiltroAtivo[] {
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
    ...(filtros.local
      ? [{ id: 'local', rotulo: 'Local', valor: caminhoDoLocal(filtros.local) ?? '…' }]
      : []),
  ];
}
