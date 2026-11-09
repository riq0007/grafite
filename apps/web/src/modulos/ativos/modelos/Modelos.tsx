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
  Linha,
  MiniaturaDeAtivo,
  RotuloDeSituacao,
  Selecao,
  Tabela,
} from '@grafite/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback } from 'react';
import { itensDasPaginas, paginar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { CampoComEspera } from '../../administracao/CampoComEspera.tsx';
import { SITUACOES_DO_REGISTRO } from '../../administracao/situacoes.ts';
import estilos from '../Ativos.module.css';
import { CHAVE_DOS_MODELOS, type TipoDeAtivo, useTipos } from '../consultas.ts';
import { type FiltrosDeModelos, SITUACOES_DO_FILTRO, type SituacaoDoFiltro } from '../filtros.ts';
import { imagemDoModelo } from './imagens.ts';

/** Quantos modelos cada página traz. */
const POR_PAGINA = 50;

const contagem = (total: number) =>
  total === 1 ? '1 modelo' : `${total.toLocaleString('pt-BR')} modelos`;

/** O tipo na escolha do filtro: o inativo também, porque os modelos dele continuam na lista. */
const rotuloDoTipo = (tipo: TipoDeAtivo) =>
  tipo.situacao === 'inativo' ? `${tipo.nome} (inativo)` : tipo.nome;

/**
 * A lista de modelos de equipamento (spec catalogo-de-ativos): a busca e os filtros de tipo e de
 * situação à vista e no endereço, os filtros ativos e a tabela paginada pelo fabricante e pelo
 * nome, com a miniatura da imagem ou o ícone do tipo. A linha abre a ficha.
 */
export function Modelos() {
  const filtros = useSearch({ from: '/gestao/catalogo/modelos' });
  const navegar = useNavigate({ from: '/gestao/catalogo/modelos' });
  const { pode } = useAcesso();
  const api = useApi();
  const tipos = useTipos();

  const mudarFiltros = useCallback(
    (mudanca: Partial<FiltrosDeModelos>) =>
      void navegar({ search: (atual) => ({ ...atual, ...mudanca }), replace: true }),
    [navegar],
  );
  const mudarBusca = useCallback(
    (busca: string) => mudarFiltros({ busca: busca.trim() === '' ? undefined : busca }),
    [mudarFiltros],
  );
  const limparFiltros = () =>
    void navegar({
      search: (atual) => ({ ...atual, busca: undefined, tipo: undefined, situacao: undefined }),
      replace: true,
    });
  const abrirFicha = (id: string) =>
    void navegar({ to: '/gestao/catalogo/modelos/$id', params: { id } });
  const novoModelo = () => void navegar({ to: '/gestao/catalogo/modelos/novo' });

  const parametros = {
    busca: filtros.busca,
    tipo: filtros.tipo,
    situacao: filtros.situacao ?? 'ativos',
  } as const;
  const modelos = useInfiniteQuery({
    queryKey: [...CHAVE_DOS_MODELOS, parametros],
    ...paginar(
      (cursor) =>
        api.GET('/modelos', { params: { query: { ...parametros, cursor, limite: POR_PAGINA } } }),
      'carregar os modelos',
    ),
  });
  const lista = itensDasPaginas(modelos.data);
  const nomeDoTipo = tipos.data?.tipos.find((tipo) => tipo.id === filtros.tipo)?.nome;
  const ativos: FiltroAtivo[] = [
    ...(filtros.busca ? [{ id: 'busca', rotulo: 'Busca', valor: filtros.busca }] : []),
    ...(filtros.tipo ? [{ id: 'tipo', rotulo: 'Tipo', valor: nomeDoTipo ?? '…' }] : []),
    ...(filtros.situacao
      ? [{ id: 'situacao', rotulo: 'Situação', valor: SITUACOES_DO_FILTRO[filtros.situacao] }]
      : []),
  ];
  const podeCadastrar = pode('modelos.editar');

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Modelos"
        acoes={
          podeCadastrar && (
            <Botao nivel="primario" icone={Plus} onPress={novoModelo}>
              Novo modelo
            </Botao>
          )
        }
      />
      <div className={estilos.filtros}>
        <CampoComEspera
          type="search"
          rotulo="Buscar modelos"
          placeholder="Fabricante ou nome"
          valor={filtros.busca ?? ''}
          aoMudar={mudarBusca}
        />
        <Selecao
          rotulo="Tipo"
          opcoes={[
            { id: 'todos', rotulo: 'Todos' },
            ...(tipos.data?.tipos ?? []).map((tipo) => ({
              id: tipo.id,
              rotulo: rotuloDoTipo(tipo),
            })),
          ]}
          selectedKey={filtros.tipo ?? 'todos'}
          onSelectionChange={(chave) => {
            const tipo = String(chave);
            mudarFiltros({ tipo: tipo === 'todos' ? undefined : tipo });
          }}
        />
        <Selecao
          rotulo="Situação"
          opcoes={Object.entries(SITUACOES_DO_FILTRO).map(([id, rotulo]) => ({ id, rotulo }))}
          selectedKey={filtros.situacao ?? 'ativos'}
          onSelectionChange={(chave) => {
            const situacao = String(chave) as SituacaoDoFiltro;
            mudarFiltros({ situacao: situacao === 'ativos' ? undefined : situacao });
          }}
        />
      </div>
      <FiltrosAtivos
        filtros={ativos}
        aoLimpar={(id) => mudarFiltros({ [id]: undefined })}
        aoLimparTodos={limparFiltros}
      />
      {modelos.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando os modelos…
        </p>
      ) : modelos.isError && !modelos.data ? (
        <EstadoVazio
          titulo={modelos.error.message}
          acao={<Botao onPress={() => void modelos.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <>
          {lista.length > 0 && (
            <p className={estilos.contagem}>{contagem(modelos.data?.pages[0]?.total ?? 0)}</p>
          )}
          <Tabela
            rotulo="Modelos"
            aoAbrirLinha={(id) => abrirFicha(String(id))}
            carregarMais={{
              haMais: modelos.hasNextPage,
              carregando: modelos.isFetchingNextPage,
              aoCarregar: () => void modelos.fetchNextPage(),
            }}
          >
            <CabecalhoDaTabela>
              <ColunaDaMiniatura>Imagem</ColunaDaMiniatura>
              <Coluna id="fabricante">Fabricante</Coluna>
              <Coluna id="nome" principal>
                Modelo
              </Coluna>
              <Coluna id="tipo">Tipo</Coluna>
              <Coluna id="situacao" especie="situacao">
                Situação
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={lista}
              vazio={
                <EstadoVazio
                  titulo="Nenhum modelo encontrado."
                  acao={
                    ativos.length > 0 ? (
                      <Botao onPress={limparFiltros}>Limpar filtros</Botao>
                    ) : podeCadastrar ? (
                      <Botao icone={Plus} onPress={novoModelo}>
                        Novo modelo
                      </Botao>
                    ) : undefined
                  }
                />
              }
            >
              {(modelo) => (
                <Linha id={modelo.id}>
                  <CelulaDaMiniatura>
                    <MiniaturaDeAtivo
                      tipo={modelo.tipo.icone}
                      imagemDoModelo={imagemDoModelo(modelo, 64)}
                    />
                  </CelulaDaMiniatura>
                  <Celula>{modelo.fabricante}</Celula>
                  <Celula>{modelo.nome}</Celula>
                  <Celula>{modelo.tipo.nome}</Celula>
                  <Celula>
                    <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[modelo.situacao].tipo}>
                      {SITUACOES_DO_REGISTRO[modelo.situacao].texto}
                    </RotuloDeSituacao>
                  </Celula>
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        </>
      )}
    </div>
  );
}
