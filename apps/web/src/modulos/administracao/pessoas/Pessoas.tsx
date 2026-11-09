import type { components } from '@grafite/api-client';
import { montarArvore } from '@grafite/domain';
import {
  Avatar,
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
  Linha,
  QuickLook,
  RotuloDeSituacao,
  Selecao,
  type Situacao,
  Tabela,
  usePrevia,
} from '@grafite/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { consultar, itensDasPaginas, paginar } from '../../../api/consultas.ts';
import { miniaturasDaPessoa } from '../../../api/fotos.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import estilos from '../Administracao.module.css';
import { CampoComEspera } from '../CampoComEspera.tsx';
import { SeletorDeLocal } from '../seletores/SeletorDeLocal.tsx';
import {
  CONTAS_DO_FILTRO,
  type ContaDoFiltro,
  type FiltrosDePessoas,
  SITUACOES_DO_FILTRO,
  type SituacaoDoFiltro,
} from './filtros.ts';

type Pessoa = components['schemas']['Pessoa'];

/** Quantas pessoas cada página traz. */
const POR_PAGINA = 50;
/** Quanto a busca espera a digitação parar antes de ir à API. */

export const SITUACOES_DA_PESSOA: Record<Pessoa['situacao'], { tipo: Situacao; texto: string }> = {
  ativa: { tipo: 'sucesso', texto: 'Ativa' },
  inativa: { tipo: 'neutra', texto: 'Inativa' },
  anonimizada: { tipo: 'neutra', texto: 'Anonimizada' },
};

const contagem = (total: number) =>
  total === 1 ? '1 pessoa' : `${total.toLocaleString('pt-BR')} pessoas`;

/**
 * A lista de pessoas (spec modulo-administracao): a busca e os filtros à vista, os filtros ativos,
 * a tabela paginada com o número de pessoas, a ficha pelo clique ou Enter e a prévia pelo espaço.
 */
export function Pessoas() {
  const filtros = useSearch({ from: '/administracao/pessoas' });
  const navegar = useNavigate({ from: '/administracao/pessoas' });
  const { pode } = useAcesso();
  const api = useApi();

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDePessoas>) =>
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
        situacao: undefined,
        conta: undefined,
        local: undefined,
      }),
      replace: true,
    });
  const abrirFicha = (id: string) =>
    void navegar({ to: '/administracao/pessoas/$id', params: { id } });
  const novaPessoa = () => void navegar({ to: '/administracao/pessoas/nova' });

  const parametros = {
    busca: filtros.busca,
    situacao: filtros.situacao ?? 'ativas',
    conta: filtros.conta,
    local: filtros.local,
  } as const;
  const pessoas = useInfiniteQuery({
    queryKey: ['pessoas', parametros],
    ...paginar(
      (cursor) =>
        api.GET('/pessoas', {
          params: { query: { ...parametros, cursor, limite: POR_PAGINA } },
        }),
      'carregar as pessoas',
    ),
  });
  const lista = itensDasPaginas(pessoas.data);
  const previa = usePrevia(lista, (pessoa) => pessoa.id);

  const ativos = useFiltrosAtivos(filtros);
  const comFiltro = ativos.length > 0;
  const podeCadastrar = pode('pessoas.editar');

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Pessoas"
        acoes={
          podeCadastrar && (
            <Botao nivel="primario" icone={Plus} onPress={novaPessoa}>
              Nova pessoa
            </Botao>
          )
        }
      />
      <div className={estilos.filtros}>
        <CampoComEspera
          type="search"
          rotulo="Buscar pessoas"
          placeholder="Nome, matrícula ou usuário"
          valor={filtros.busca ?? ''}
          aoMudar={mudarBusca}
        />
        <Selecao
          rotulo="Situação"
          opcoes={Object.entries(SITUACOES_DO_FILTRO).map(([id, rotulo]) => ({ id, rotulo }))}
          selectedKey={filtros.situacao ?? 'ativas'}
          onSelectionChange={(chave) => {
            const situacao = String(chave) as SituacaoDoFiltro;
            mudarFiltros({ situacao: situacao === 'ativas' ? undefined : situacao });
          }}
        />
        <Selecao
          rotulo="Conta"
          opcoes={[
            { id: 'todas', rotulo: 'Todas' },
            ...Object.entries(CONTAS_DO_FILTRO).map(([id, rotulo]) => ({ id, rotulo })),
          ]}
          selectedKey={filtros.conta ?? 'todas'}
          onSelectionChange={(chave) => {
            const conta = String(chave);
            mudarFiltros({ conta: conta === 'todas' ? undefined : (conta as ContaDoFiltro) });
          }}
        />
        <SeletorDeLocal
          rotulo="Local de trabalho"
          valor={filtros.local ?? null}
          aoMudar={(local) => mudarFiltros({ local: local ?? undefined })}
        />
      </div>
      <FiltrosAtivos
        filtros={ativos}
        aoLimpar={(id) => mudarFiltros({ [id]: undefined })}
        aoLimparTodos={limparFiltros}
      />
      {pessoas.isPending ? (
        <div className={estilos.carregando}>
          <p role="status" className={estilos.contagem}>
            Carregando as pessoas…
          </p>
        </div>
      ) : pessoas.isError && !pessoas.data ? (
        <EstadoVazio
          titulo={pessoas.error.message}
          acao={<Botao onPress={() => void pessoas.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <>
          {lista.length > 0 && (
            <p className={estilos.contagem}>{contagem(pessoas.data?.pages[0]?.total ?? 0)}</p>
          )}
          <Tabela
            rotulo="Pessoas"
            aoAbrirLinha={abrirFicha}
            aoPreverLinha={previa.aoPreverLinha}
            carregarMais={{
              haMais: pessoas.hasNextPage,
              carregando: pessoas.isFetchingNextPage,
              aoCarregar: () => void pessoas.fetchNextPage(),
            }}
          >
            <CabecalhoDaTabela>
              <ColunaDaMiniatura>Foto</ColunaDaMiniatura>
              <Coluna id="nome" principal>
                Nome
              </Coluna>
              <Coluna id="matricula" especie="codigo">
                Matrícula
              </Coluna>
              <Coluna id="local">Local de trabalho</Coluna>
              <Coluna id="conta">Conta</Coluna>
              <Coluna id="situacao" especie="situacao">
                Situação
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={lista}
              vazio={
                <EstadoVazio
                  titulo="Nenhuma pessoa encontrada."
                  acao={
                    comFiltro ? (
                      <Botao onPress={limparFiltros}>Limpar filtros</Botao>
                    ) : podeCadastrar ? (
                      <Botao icone={Plus} onPress={novaPessoa}>
                        Nova pessoa
                      </Botao>
                    ) : undefined
                  }
                />
              }
            >
              {(pessoa) => (
                <Linha id={pessoa.id}>
                  <CelulaDaMiniatura>
                    <Avatar
                      nome={pessoa.nome}
                      imagens={miniaturasDaPessoa(pessoa.id, pessoa.foto)}
                      tamanho="linha"
                      decorativo
                    />
                  </CelulaDaMiniatura>
                  <Celula>{pessoa.nome}</Celula>
                  <Celula>{pessoa.matricula}</Celula>
                  <Celula>{pessoa.local?.caminho}</Celula>
                  <Celula>
                    <ContaNaLista conta={pessoa.conta} />
                  </Celula>
                  <Celula>
                    <RotuloDeSituacao situacao={SITUACOES_DA_PESSOA[pessoa.situacao].tipo}>
                      {SITUACOES_DA_PESSOA[pessoa.situacao].texto}
                    </RotuloDeSituacao>
                  </Celula>
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        </>
      )}
      {previa.item && (
        <QuickLook
          aberta={previa.aberta}
          aoFechar={previa.aoFechar}
          titulo={previa.item.nome}
          subtitulo={previa.item.local?.caminho}
          posicao={previa.posicao}
          total={previa.total}
          visual={
            <Avatar
              nome={previa.item.nome}
              imagens={miniaturasDaPessoa(previa.item.id, previa.item.foto)}
              tamanho="ficha"
              decorativo
            />
          }
          campos={camposDaPrevia(previa.item)}
          acoes={[
            {
              id: 'abrir',
              rotulo: 'Abrir a ficha',
              principal: true,
              aoEscolher: () => previa.item && abrirFicha(previa.item.id),
            },
          ]}
          aoAnterior={previa.aoAnterior}
          aoSeguinte={previa.aoSeguinte}
        />
      )}
    </div>
  );
}

/** A conta na lista: o usuário e, se não estiver ativa, a situação dela. */
function ContaNaLista({ conta }: { conta: Pessoa['conta'] }) {
  if (!conta) return <span className={estilos.semValor}>Sem conta</span>;
  return (
    <span className={estilos.conta}>
      {conta.usuario}
      {conta.situacao !== 'ativa' && (
        <RotuloDeSituacao situacao="neutra">
          {conta.situacao === 'inativa' ? 'Conta inativa' : 'Conta anonimizada'}
        </RotuloDeSituacao>
      )}
    </span>
  );
}

function camposDaPrevia(pessoa: Pessoa) {
  const campos = [
    { rotulo: 'E-mail', valor: pessoa.email },
    { rotulo: 'Matrícula', valor: pessoa.matricula, mono: true },
    { rotulo: 'Telefone', valor: pessoa.telefone },
    { rotulo: 'Local de trabalho', valor: pessoa.local?.caminho ?? null },
    {
      rotulo: 'Conta',
      valor: pessoa.conta
        ? `${pessoa.conta.usuario ?? 'Anonimizada'}${pessoa.conta.situacao === 'inativa' ? ' (inativa)' : ''}`
        : 'Sem conta',
    },
    { rotulo: 'Situação', valor: SITUACOES_DA_PESSOA[pessoa.situacao].texto },
  ];
  return campos.flatMap(({ valor, ...campo }) => (valor ? [{ ...campo, valor }] : []));
}

/** Os filtros fora do padrão, com o nome e o valor de cada um. */
function useFiltrosAtivos(filtros: FiltrosDePessoas): FiltroAtivo[] {
  const api = useApi();
  const locais = useQuery({
    queryKey: ['locais'],
    queryFn: () => consultar(() => api.GET('/locais'), 'carregar os locais'),
    enabled: filtros.local !== undefined,
  });
  const caminhoDoLocal = useMemo(() => {
    if (!filtros.local || !locais.data) return null;
    return montarArvore(locais.data.locais).caminho(filtros.local);
  }, [filtros.local, locais.data]);
  return [
    ...(filtros.busca ? [{ id: 'busca', rotulo: 'Busca', valor: filtros.busca }] : []),
    ...(filtros.situacao
      ? [{ id: 'situacao', rotulo: 'Situação', valor: SITUACOES_DO_FILTRO[filtros.situacao] }]
      : []),
    ...(filtros.conta
      ? [{ id: 'conta', rotulo: 'Conta', valor: CONTAS_DO_FILTRO[filtros.conta] }]
      : []),
    ...(filtros.local
      ? [{ id: 'local', rotulo: 'Local de trabalho', valor: caminhoDoLocal ?? '…' }]
      : []),
  ];
}
