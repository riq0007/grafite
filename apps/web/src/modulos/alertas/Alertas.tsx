// As listas dos alertas (spec modulo-alertas, "Lista dos alertas abertos" e "Lista dos alertas
// resolvidos"; change p3a-regras-e-alertas, design, decisão 11): os alertas que a conta vê, na
// tabela base, com a miniatura, a severidade em texto e a situação; os filtros e a ordem no
// endereço; a linha que abre a ficha do ativo ou a tela do coletor; e o reconhecer e o adiar de
// quem pode tratar cada alerta.
import { ROTULOS_DAS_SEVERIDADES, type SeveridadeDoAlerta } from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  CelulaDaMiniatura,
  Coluna,
  ColunaDaMiniatura,
  CorpoDaTabela,
  EstadoVazio,
  type FiltroAtivo,
  FiltrosAtivos,
  idadeRelativa,
  Linha,
  MiniaturaDeAtivo,
  type Ordenacao,
  RotuloDeSituacao,
  Selecao,
  type Situacao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { itensDasPaginas } from '../../api/consultas.ts';
import { useAgora } from '../../casca/status/useAgora.ts';
import { AcoesDoAlerta } from './AcoesDoAlerta.tsx';
import estilos from './Alertas.module.css';
import { type AlertaNaLista, useAlertas, useRegras } from './consultas.ts';
import {
  type FiltrosDosAbertos,
  type FiltrosDosResolvidos,
  ORDEM_DE_FABRICA,
  ordemDaApi,
} from './filtros.ts';
import { COMO_TERMINOU, destinoDoAlvo, miniaturaDoAlvo } from './textos.ts';

const TODAS = 'todas';

const OPCOES_DE_SEVERIDADE = [
  { id: TODAS, rotulo: 'Todas as severidades' },
  ...(Object.keys(ROTULOS_DAS_SEVERIDADES) as SeveridadeDoAlerta[]).map((id) => ({
    id,
    rotulo: ROTULOS_DAS_SEVERIDADES[id],
  })),
];

const abertos = (total: number) => (total === 1 ? '1 aberto' : `${total} abertos`);

type PaginasDosAlertas = ReturnType<typeof useAlertas>;

/** A severidade em texto, com o ícone e a cor da situação. */
function Severidade({ alerta }: { alerta: AlertaNaLista }) {
  return (
    <RotuloDeSituacao situacao={alerta.severidade}>
      {ROTULOS_DAS_SEVERIDADES[alerta.severidade]}
    </RotuloDeSituacao>
  );
}

/** O filtro da severidade e o da regra, com as regras da organização. */
function FiltrosDaLista({
  severidade,
  regra,
  aoMudar,
}: {
  severidade?: SeveridadeDoAlerta;
  regra?: string;
  aoMudar: (mudanca: { severidade?: SeveridadeDoAlerta; regra?: string }) => void;
}) {
  const regras = useRegras();
  return (
    <div className={estilos.filtros}>
      <Selecao
        rotulo="Severidade"
        opcoes={OPCOES_DE_SEVERIDADE}
        selectedKey={severidade ?? TODAS}
        onSelectionChange={(chave) => {
          const escolhida = String(chave);
          aoMudar({
            severidade: escolhida === TODAS ? undefined : (escolhida as SeveridadeDoAlerta),
          });
        }}
      />
      <Selecao
        rotulo="Regra"
        opcoes={[
          { id: TODAS, rotulo: 'Todas as regras' },
          ...(regras.data?.regras ?? []).map(({ id, nome }) => ({ id, rotulo: nome })),
        ]}
        selectedKey={regra ?? TODAS}
        onSelectionChange={(chave) => {
          const escolhida = String(chave);
          aoMudar({ regra: escolhida === TODAS ? undefined : escolhida });
        }}
      />
    </div>
  );
}

/** Os filtros fora do padrão, com o nome e o valor de cada um. */
function filtrosAtivos(
  filtros: {
    severidade?: SeveridadeDoAlerta;
    regra?: string;
    ativo?: string;
    nomeDoAtivo?: string;
  },
  nomeDaRegra: (id: string) => string,
): FiltroAtivo[] {
  return [
    ...(filtros.severidade
      ? [
          {
            id: 'severidade',
            rotulo: 'Severidade',
            valor: ROTULOS_DAS_SEVERIDADES[filtros.severidade],
          },
        ]
      : []),
    ...(filtros.regra ? [{ id: 'regra', rotulo: 'Regra', valor: nomeDaRegra(filtros.regra) }] : []),
    ...(filtros.ativo
      ? [{ id: 'ativo', rotulo: 'Ativo', valor: filtros.nomeDoAtivo ?? 'Ativo escolhido' }]
      : []),
  ];
}

/** O que a lista mostra antes da tabela: carregando ou a falha, com "Tentar de novo". */
function EstadoDaLista({
  alertas,
  carregando,
  children,
}: {
  alertas: PaginasDosAlertas;
  carregando: string;
  children: ReactNode;
}) {
  if (alertas.isPending) {
    return (
      <p role="status" className={estilos.contagem}>
        {carregando}
      </p>
    );
  }
  if (alertas.isError && !alertas.data) {
    return (
      <EstadoVazio
        titulo={alertas.error.message}
        acao={<Botao onPress={() => void alertas.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  return children;
}

/**
 * A situação de um alerta aberto no selo, como nas outras tabelas (change tabelas-consistentes):
 * aberto, reconhecido, com quem reconheceu, ou adiado, com até quando, e o silêncio do ativo.
 */
function SituacaoDoAlerta({ alerta }: { alerta: AlertaNaLista }) {
  const { formatarHora } = useDataHora();
  const [selo, situacao, detalhe]: [string, Situacao, string | null] = alerta.adiado
    ? ['Adiado', 'neutra', `até ${formatarHora(new Date(alerta.adiado.ate))}`]
    : alerta.reconhecido
      ? ['Reconhecido', 'info', `por ${alerta.reconhecido.nome}`]
      : ['Aberto', 'atencao', null];
  return (
    <span className={estilos.situacao}>
      <span>
        <RotuloDeSituacao situacao={situacao}>{selo}</RotuloDeSituacao>
        {detalhe && (
          <>
            {' '}
            <span className={estilos.detalheDaSituacao}>{detalhe}</span>
          </>
        )}
      </span>
      {alerta.silencio && <span className={estilos.silenciado}>Ativo silenciado</span>}
    </span>
  );
}

/** A lista dos alertas abertos, a tela do item Abertos do dock. */
export function AlertasAbertos() {
  const filtros = useSearch({ from: '/alertas/' });
  const navegar = useNavigate({ from: '/alertas/' });
  const agora = useAgora();
  const ordenacao: Ordenacao = filtros.coluna
    ? { coluna: filtros.coluna, direcao: filtros.direcao ?? 'crescente' }
    : ORDEM_DE_FABRICA;
  const alertas = useAlertas({
    situacao: 'abertos',
    severidade: filtros.severidade,
    regra: filtros.regra,
    ...ordemDaApi(ordenacao),
  });
  const regras = useRegras();
  const lista = itensDasPaginas(alertas.data);
  const total = alertas.data?.pages[0]?.total ?? 0;
  const algumTrata = lista.some((alerta) => alerta.permite.tratar);

  const mudarFiltros = (mudanca: Partial<FiltrosDosAbertos>) =>
    void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true });
  const limparFiltros = () => mudarFiltros({ severidade: undefined, regra: undefined });
  const ativos = filtrosAtivos(
    filtros,
    (id) => regras.data?.regras.find((regra) => regra.id === id)?.nome ?? 'Regra escolhida',
  );
  const destinos = new Map(lista.map((alerta) => [alerta.id, destinoDoAlvo(alerta.alvo)]));

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={
          <>
            Alertas abertos
            {!alertas.isPending && lista.length > 0 && (
              <>
                {' '}
                <span className={estilos.contagemDoTitulo}>{abertos(total)}</span>
              </>
            )}
          </>
        }
      />
      <FiltrosDaLista
        severidade={filtros.severidade}
        regra={filtros.regra}
        aoMudar={mudarFiltros}
      />
      <FiltrosAtivos
        filtros={ativos}
        aoLimpar={(id) => mudarFiltros({ [id]: undefined })}
        aoLimparTodos={limparFiltros}
      />
      <EstadoDaLista alertas={alertas} carregando="Carregando os alertas…">
        <Tabela
          rotulo="Alertas abertos"
          ordenacao={ordenacao}
          aoOrdenar={(nova) =>
            mudarFiltros({
              coluna: nova.coluna as FiltrosDosAbertos['coluna'],
              direcao: nova.direcao,
            })
          }
          aoAbrirLinha={(id) => {
            const destino = destinos.get(String(id));
            if (destino) void navegar({ to: destino });
          }}
          carregarMais={{
            haMais: alertas.hasNextPage,
            carregando: alertas.isFetchingNextPage,
            aoCarregar: () => void alertas.fetchNextPage(),
          }}
        >
          <CabecalhoDaTabela>
            <ColunaDaMiniatura />
            <Coluna id="ativo" principal ordenavel>
              Ativo
            </Coluna>
            <Coluna id="alerta" ordenavel>
              Alerta
            </Coluna>
            <Coluna id="regra">Regra</Coluna>
            <Coluna id="ha" ordenavel especie="data">
              Há
            </Coluna>
            <Coluna id="severidade" ordenavel especie="situacao">
              Severidade
            </Coluna>
            <Coluna id="situacao" especie="situacao">
              Situação
            </Coluna>
            {algumTrata ? (
              <Coluna id="acoes" especie="acoes">
                Ações
              </Coluna>
            ) : null}
          </CabecalhoDaTabela>
          <CorpoDaTabela
            itens={lista}
            dependencias={[agora, algumTrata]}
            vazio={
              ativos.length > 0 ? (
                <EstadoVazio titulo="Nenhum alerta com esses filtros." />
              ) : (
                <EstadoVazio titulo="Nenhum alerta aberto." />
              )
            }
          >
            {(alerta) => (
              <Linha id={alerta.id}>
                <CelulaDaMiniatura>
                  <MiniaturaDeAtivo {...miniaturaDoAlvo(alerta.alvo)} />
                </CelulaDaMiniatura>
                <Celula>{alerta.alvo.nome}</Celula>
                <Celula>{alerta.texto}</Celula>
                <Celula>{alerta.regra.nome}</Celula>
                <Celula>
                  <time className="mono" dateTime={alerta.abertoEm}>
                    {idadeRelativa(new Date(alerta.abertoEm), agora)}
                  </time>
                </Celula>
                <Celula>
                  <Severidade alerta={alerta} />
                </Celula>
                <Celula>
                  <SituacaoDoAlerta alerta={alerta} />
                </Celula>
                {algumTrata ? (
                  <Celula>
                    {alerta.permite.tratar ? <AcoesDoAlerta alerta={alerta} /> : null}
                  </Celula>
                ) : null}
              </Linha>
            )}
          </CorpoDaTabela>
        </Tabela>
      </EstadoDaLista>
    </div>
  );
}

/** A lista dos alertas resolvidos e encerrados, do mais recente, a tela do item Resolvidos. */
export function AlertasResolvidos() {
  const filtros = useSearch({ from: '/alertas/resolvidos' });
  const navegar = useNavigate({ from: '/alertas/resolvidos' });
  const { formatarDataEHora } = useDataHora();
  const alertas = useAlertas({
    situacao: 'resolvidos',
    severidade: filtros.severidade,
    regra: filtros.regra,
    ativo: filtros.ativo,
  });
  const regras = useRegras();
  const lista = itensDasPaginas(alertas.data);

  const mudarFiltros = (mudanca: Partial<FiltrosDosResolvidos>) =>
    void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true });
  const limparFiltros = () =>
    mudarFiltros({
      severidade: undefined,
      regra: undefined,
      ativo: undefined,
      nomeDoAtivo: undefined,
    });
  const ativos = filtrosAtivos(
    filtros,
    (id) => regras.data?.regras.find((regra) => regra.id === id)?.nome ?? 'Regra escolhida',
  );
  const destinos = new Map(lista.map((alerta) => [alerta.id, destinoDoAlvo(alerta.alvo)]));

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Alertas resolvidos" />
      <FiltrosDaLista
        severidade={filtros.severidade}
        regra={filtros.regra}
        aoMudar={mudarFiltros}
      />
      <FiltrosAtivos
        filtros={ativos}
        aoLimpar={(id) =>
          mudarFiltros(
            id === 'ativo' ? { ativo: undefined, nomeDoAtivo: undefined } : { [id]: undefined },
          )
        }
        aoLimparTodos={limparFiltros}
      />
      <EstadoDaLista alertas={alertas} carregando="Carregando os alertas resolvidos…">
        <Tabela
          rotulo="Alertas resolvidos"
          aoAbrirLinha={(id) => {
            const destino = destinos.get(String(id));
            if (destino) void navegar({ to: destino });
          }}
          carregarMais={{
            haMais: alertas.hasNextPage,
            carregando: alertas.isFetchingNextPage,
            aoCarregar: () => void alertas.fetchNextPage(),
          }}
        >
          <CabecalhoDaTabela>
            <ColunaDaMiniatura />
            <Coluna id="ativo" principal>
              Ativo
            </Coluna>
            <Coluna id="alerta">Alerta</Coluna>
            <Coluna id="regra">Regra</Coluna>
            <Coluna id="abriu" especie="data">
              Abriu
            </Coluna>
            <Coluna id="terminou" especie="data">
              Terminou
            </Coluna>
            <Coluna id="como">Como terminou</Coluna>
            <Coluna id="severidade" especie="situacao">
              Severidade
            </Coluna>
          </CabecalhoDaTabela>
          <CorpoDaTabela
            itens={lista}
            vazio={
              <EstadoVazio
                titulo={
                  ativos.length > 0
                    ? 'Nenhum alerta resolvido com esses filtros.'
                    : 'Nenhum alerta resolvido.'
                }
              />
            }
          >
            {(alerta) => (
              <Linha id={alerta.id}>
                <CelulaDaMiniatura>
                  <MiniaturaDeAtivo {...miniaturaDoAlvo(alerta.alvo)} />
                </CelulaDaMiniatura>
                <Celula>{alerta.alvo.nome}</Celula>
                <Celula>{alerta.texto}</Celula>
                <Celula>{alerta.regra.nome}</Celula>
                <Celula>
                  <time className="mono" dateTime={alerta.abertoEm}>
                    {formatarDataEHora(new Date(alerta.abertoEm))}
                  </time>
                </Celula>
                <Celula>
                  {alerta.resolvidoEm && (
                    <time className="mono" dateTime={alerta.resolvidoEm}>
                      {formatarDataEHora(new Date(alerta.resolvidoEm))}
                    </time>
                  )}
                </Celula>
                <Celula>{alerta.comoTerminou ? COMO_TERMINOU[alerta.comoTerminou] : '—'}</Celula>
                <Celula>
                  <Severidade alerta={alerta} />
                </Celula>
              </Linha>
            )}
          </CorpoDaTabela>
        </Tabela>
      </EstadoDaLista>
    </div>
  );
}
